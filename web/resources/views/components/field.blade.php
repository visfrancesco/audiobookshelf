@props(['name', 'label', 'type' => 'text', 'value' => '', 'required' => false, 'hint' => null])
<label class="field"><span>{{ $label }}
@if($required)<span class="required" aria-hidden="true"> *</span>
@endif</span>
@if($type === 'textarea')<textarea name="{{ $name }}" {{ $attributes }} @required($required)>{{ old($name, $value) }}</textarea>
@else<input name="{{ $name }}" type="{{ $type }}" value="{{ $type === 'password' ? '' : old($name, $value) }}" {{ $attributes }} @required($required)>
@endif
@if($hint)<small>{{ $hint }}</small>
@endif
</label>
