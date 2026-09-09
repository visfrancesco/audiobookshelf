<div class="form-grid">
@foreach($fields as $key => $field)
@php($value = $values[$key] ?? '')
@if($field[1] === 'checkbox')<label class="check"><input type="checkbox" name="{{ $key }}" value="1" @checked(old($key, $value))>{{ $field[0] }}</label>
@elseif($field[1] === 'select')<label class="field"><span>{{ $field[0] }}</span><select name="{{ $key }}">
@foreach($field[2] as $option => $label)<option value="{{ $option }}" @selected((string) old($key, $value) === (string) $option)>{{ $label }}</option>
@endforeach</select></label>
@else<x-field :name="$key" :label="$field[0]" :type="$field[1] === 'lines' ? 'textarea' : $field[1]" :value="is_array($value) ? implode("\n", $value) : $value" :step="$field[1] === 'number' ? 'any' : null" />
@endif
@endforeach</div>
