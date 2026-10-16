import type { PickerType } from '@/files/types.ts'

export const PROJECT_TYPE: PickerType = {
  description: 'drift project',
  accept: { 'application/json': ['.json'] },
}

export const WAV_TYPE: PickerType = {
  description: 'WAV audio',
  accept: { 'audio/wav': ['.wav'] },
}
