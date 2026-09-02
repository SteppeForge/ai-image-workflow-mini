import { randomUUID } from 'node:crypto';

interface StoredImage {
  bytes: Buffer;
  contentType: string;
}

/** In-memory картинки: в снапшоты и SSE идёт лёгкая /images/<id>, а не base64. */
export class ImageStore {
  private readonly images = new Map<string, StoredImage>();

  save(bytes: Buffer, contentType: string): string {
    const id = randomUUID();
    this.images.set(id, { bytes, contentType });
    return id;
  }

  get(id: string): StoredImage | undefined {
    return this.images.get(id);
  }
}
