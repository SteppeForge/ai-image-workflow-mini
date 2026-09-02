export interface GenerateImageInput {
  prompt: string;
  negativePrompt: string | null;
  references: string[];
  signal: AbortSignal;
}

export interface EditImageInput {
  imageBytes: Buffer;
  contentType: string;
  instruction: string;
  signal: AbortSignal;
}

/** URL (например data-URL мока) или байты — их executor кладёт в ImageStore. */
export type ImageResult =
  | { kind: 'url'; url: string }
  | { kind: 'bytes'; bytes: Buffer; contentType: string };

export interface ImageProvider {
  readonly name: string;
  readonly supportsEdit: boolean;
  generateImage(input: GenerateImageInput): Promise<ImageResult>;
  editImage(input: EditImageInput): Promise<ImageResult>;
}
