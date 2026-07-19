import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';

@Processor('email')
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  async process(job: Job<{ to: string; subject: string; body: string }>) {
    const { to, subject, body } = job.data;
    // In production, use nodemailer transporter here
    // For now, just log (real SMTP config needed for actual sending)
    this.logger.log(`[EMAIL] To: ${to}, Subject: ${subject}`);
    this.logger.log(`[EMAIL] Body preview: ${body.substring(0, 100)}...`);
    // Simulate sending delay
    await new Promise((r) => setTimeout(r, 500));
    this.logger.log(`[EMAIL] Sent to ${to}`);
  }
}
