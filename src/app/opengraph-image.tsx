import { ogAlt, ogContentType, ogSize, renderOgImage } from "@/lib/ogImage";

export const runtime = "edge";
export const alt = ogAlt;
export const size = ogSize;
export const contentType = ogContentType;

export default function OpengraphImage() {
  return renderOgImage();
}
