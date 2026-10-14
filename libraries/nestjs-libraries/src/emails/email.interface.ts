export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface EmailInterface {
  name: string;
  validateEnvKeys: string[];
  sendEmail(
    to: string,
    subject: string,
    html: string,
    emailFromName: string,
    emailFromAddress: string,
    replyTo?: string,
    attachments?: EmailAttachment[]
  ): Promise<any>;
}
