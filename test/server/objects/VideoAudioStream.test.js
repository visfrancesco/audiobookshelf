const { expect } = require('chai')
const fs = require('fs/promises')
const os = require('os')
const Path = require('path')
const { execFileSync } = require('child_process')
const { VideoAudioStream, AudioStreamBudget } = require('../../../server/objects/VideoAudioStream')
const { describeVideo, containedFile, revisionFor } = require('../../../server/utils/videoPodcastUtils')

describe('Video podcast media', function () {
  this.timeout(30000)
  let directory, media, descriptor
  const probe = path => JSON.parse(execFileSync(process.env.FFPROBE_PATH || 'ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-show_chapters', '-of', 'json', path]))
  before(async function () {
    try { execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-version'], { stdio: 'ignore' }) } catch (_) { this.skip() }
    directory = await fs.mkdtemp(Path.join(os.tmpdir(), 'abs-video-test-'))
    media = Path.join(directory, 'episode.mp4')
    await fs.writeFile(Path.join(directory, 'chapters.txt'), ';FFMETADATA1\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=0\nEND=6000\ntitle=Introduction\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=6000\nEND=25000\ntitle=Interview\n')
    execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=160x90:r=10', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-i', Path.join(directory, 'chapters.txt'), '-map', '0:v', '-map', '1:a', '-map_metadata', '2', '-map_chapters', '2', '-t', '25', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', media])
    descriptor = describeVideo(probe(media))
  })
  after(async () => { if (directory) await fs.rm(directory, { recursive: true, force: true }) })

  it('probes moving video and preserves chapter titles and bounds', () => {
    expect(descriptor.watchAvailable).to.equal(true)
    expect(descriptor.audioIndex).to.equal(1)
    expect(descriptor.chapters.map(c => c.title)).to.deep.equal(['Introduction', 'Interview'])
    expect(descriptor.chapters[1].start).to.equal(6)
  })
  it('rejects cover art in place of moving video and handles missing audio', () => {
    expect(() => describeVideo({ streams: [{ codec_type: 'video', disposition: { attached_pic: 1 } }, { codec_type: 'audio' }], format: { duration: '10' } })).to.throw('moving video')
    expect(() => describeVideo({ streams: [{ codec_type: 'video' }], format: { duration: '10' } })).to.throw('audio')
  })
  it('rejects traversal and symlinks outside the shared root', async () => {
    await fs.symlink('/etc/passwd', Path.join(directory, 'outside'))
    for (const path of ['../../etc/passwd', 'outside', '/etc/passwd']) {
      try { await containedFile(directory, path); throw new Error('accepted unsafe path') } catch (error) { expect(error.message).not.to.equal('accepted unsafe path') }
    }
    expect(revisionFor((await containedFile(directory, 'episode.mp4')).stat)).to.have.length(64)
  })
  it('serves unbuffered seeks as audio-only segments with absolute timestamps', async () => {
    const budget = new AudioStreamBudget()
    const stream = new VideoAudioStream('session-test', directory, { title: 'Episode', duration: descriptor.duration, videoSource: descriptor }, media, budget)
    await stream.generatePlaylist()
    // Request middle before beginning, and deduplicate simultaneous requests.
    const paths = await Promise.all([stream.ensureSegment('output-2.ts'), stream.ensureSegment('output-2.ts'), stream.ensureSegment('output-0.ts')])
    expect(paths[0]).to.equal(paths[1])
    const raw = probe(paths[0])
    expect(raw.streams.every(s => s.codec_type === 'audio')).to.equal(true)
    expect(Number(raw.format.start_time)).to.be.closeTo(12, 0.1)
    expect(Number(raw.format.duration)).to.be.closeTo(6, 0.1)
    expect(budget.bytes).to.be.greaterThan(0)
    await stream.close()
    expect(budget.bytes).to.equal(0)
    expect(budget.active).to.equal(0)
    try { await fs.access(stream.streamPath); throw new Error('stream remains') } catch (error) { expect(error.code).to.equal('ENOENT') }
  })
  it('enforces temporary storage limits without retaining partial files', async () => {
    const budget = new AudioStreamBudget(1, 1)
    const stream = new VideoAudioStream('session-limit', directory, { title: 'Episode', duration: descriptor.duration, videoSource: descriptor }, media, budget)
    await stream.generatePlaylist()
    try { await stream.ensureSegment('output-0.ts'); throw new Error('limit not enforced') } catch (error) { expect(error.status).to.equal(503) }
    expect((await fs.readdir(stream.streamPath)).filter(p => p.endsWith('.partial'))).to.deep.equal([])
    expect(budget.active).to.equal(0)
    await stream.close()
  })

  it('rejects alternate spellings that would duplicate cached segments', async () => {
    const stream = new VideoAudioStream('session-canonical', directory, { duration: descriptor.duration, videoSource: descriptor }, media, new AudioStreamBudget())
    for (const filename of ['output-00.ts', 'output-01.ts', 'output--1.ts']) {
      try { await stream.ensureSegment(filename); throw new Error('accepted noncanonical segment') }
      catch (error) { expect(error.status).to.equal(404) }
    }
    await stream.close()
  })
})
