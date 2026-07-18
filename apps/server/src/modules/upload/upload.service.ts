import { Injectable, BadRequestException } from '@nestjs/common';
import sharp from 'sharp';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class UploadService {
  private readonly uploadDir = path.join(process.cwd(), 'uploads');

  constructor() {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  /** Save uploaded file and generate thumbnail */
  async saveFile(file: Express.Multer.File): Promise<{ original: string; thumbnail: string }> {
    if (!file) throw new BadRequestException('请上传文件');

    const timestamp = Date.now();
    const ext = path.extname(file.originalname) || '.jpg';
    const filename = `${timestamp}${ext}`;
    const thumbFilename = `${timestamp}_thumb${ext}`;

    const filePath = path.join(this.uploadDir, filename);
    const thumbPath = path.join(this.uploadDir, thumbFilename);

    // Write original
    fs.writeFileSync(filePath, file.buffer);

    // Generate 200x200 thumbnail with Sharp
    await sharp(file.buffer).resize(200, 200, { fit: 'cover' }).toFile(thumbPath);

    return {
      original: `/uploads/${filename}`,
      thumbnail: `/uploads/${thumbFilename}`,
    };
  }

  /** Save multiple files */
  async saveFiles(files: Express.Multer.File[]): Promise<{ original: string; thumbnail: string }[]> {
    return Promise.all(files.map((f) => this.saveFile(f)));
  }
}
