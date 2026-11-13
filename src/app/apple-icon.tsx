import { ImageResponse } from 'next/og';
import { CalendarIcon } from './icon';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(<CalendarIcon scale={180 / 512} />, size);
}
