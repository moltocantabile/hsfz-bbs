import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { UPLOAD_DIR } from "./db";

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function isAllowedImageType(file: File): boolean {
  return !!EXT_BY_TYPE[file.type];
}

/** 剥离 JPEG 元数据：移除全部 APPn（含 EXIF/GPS/ICC/XMP）与注释段，保留压缩数据 */
function stripJpegMetadata(buf: Buffer): Buffer {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return buf;
  // 最小 JFIF APP0 头
  const out: Buffer[] = [
    Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00,
      0x01, 0x00, 0x01, 0x00, 0x00,
    ]),
  ];
  let i = 2;
  while (i < buf.length - 1) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    if (marker === 0xda) { out.push(buf.subarray(i)); break; } // 扫描数据起点，其后原样保留
    if (marker === 0xd9) break;
    if (i + 4 > buf.length) break;
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xe0 && marker <= 0xef) { i += 2 + len; continue; } // APPn：EXIF/GPS 等全部丢弃
    if (marker === 0xfe) { i += 2 + len; continue; } // COM 注释
    out.push(buf.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  return Buffer.concat(out);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (~c) >>> 0;
}

/** 剥离 PNG 元数据：移除 eXIf（可能含 GPS）与 tEXt/iTXt/zTXt 文字信息，保留必需块并重算 CRC */
function stripPngMetadata(buf: Buffer): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buf.length < 8 || !buf.subarray(0, 8).equals(sig)) return buf;
  const parts: Buffer[] = [sig];
  let i = 8;
  while (i + 12 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.subarray(i + 4, i + 8).toString("ascii");
    const dataEnd = i + 8 + len;
    if (dataEnd + 4 > buf.length) break; // 结构异常，保留剩余原样
    if (type === "eXIf" || type === "tEXt" || type === "iTXt" || type === "zTXt") {
      i = dataEnd + 4;
      continue;
    }
    const typeBuf = buf.subarray(i + 4, i + 8);
    const data = buf.subarray(i + 8, dataEnd);
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(len);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
    parts.push(lenBuf, typeBuf, data, crcBuf);
    i = dataEnd + 4;
    if (type === "IEND") break;
  }
  return Buffer.concat(parts);
}

/** 保存一张上传图片，返回可访问的 /uploads/ 路径（自动剥离 EXIF/GPS 元数据，防止开盒） */
export async function saveUploadImage(file: File, prefix: string): Promise<string> {
  const ext = EXT_BY_TYPE[file.type];
  if (!ext) throw new Error("仅支持 JPG / PNG / WEBP / GIF 格式图片");
  if (file.size > 8 * 1024 * 1024) throw new Error("单张图片不能超过 8MB");
  let buf: Buffer<ArrayBufferLike> = Buffer.from(await file.arrayBuffer());
  if (ext === "jpg") buf = stripJpegMetadata(buf);
  if (ext === "png") buf = stripPngMetadata(buf);
  const name = `${prefix}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  return `/uploads/${name}`;
}

/** 删除已保存的上传图片（按 /uploads/xxx 路径） */
export function removeUploadFile(url: string): void {
  if (!url.startsWith("/uploads/")) return;
  try {
    fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(url)));
  } catch {
    /* 文件不存在则忽略 */
  }
}
