import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null;
  private readonly emailFrom: string;
  private readonly frontendOrigin: string;
  private readonly isTestEnvironment: boolean;

  constructor(private readonly configService: ConfigService) {
    this.isTestEnvironment =
      this.configService.get<string>('NODE_ENV') === 'test';

    this.emailFrom = this.configService.get<string>('EMAIL_FROM', '');
    this.frontendOrigin =
      this.configService.getOrThrow<string>('FRONTEND_ORIGIN');

    this.resend = this.isTestEnvironment
      ? null
      : new Resend(this.configService.getOrThrow<string>('RESEND_API_KEY'));
  }

  async sendVerificationEmail(email: string, token: string): Promise<void> {
    if (this.isTestEnvironment) {
      this.logger.debug(
        `Email delivery skipped in test environment for ${email}`,
      );
      return;
    }

    const verificationUrl = new URL('/verify-email', this.frontendOrigin);

    verificationUrl.searchParams.set('token', token);

    try {
      const { error } = await this.resend!.emails.send({
        from: this.emailFrom,
        to: email,
        subject: 'Verify your Premium Store account',
        html: `
          <div>
            <h2>Welcome to Premium Store!</h2>
            <p>Please verify your email address to activate your account.</p>
            <p>
              <a href="${verificationUrl.toString()}">
                Verify Email Address
              </a>
            </p>
            <p>This verification link expires in 24 hours.</p>
            <p>If you did not create this account, you can ignore this email.</p>
          </div>
        `,
      });

      if (error) {
        this.logger.error(
          `Failed to send verification email: ${error.message}`,
        );
        throw new InternalServerErrorException(
          'Unable to send verification email',
        );
      }
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }

      this.logger.error('Email delivery failed', error);
      throw new InternalServerErrorException(
        'Unable to send verification email',
      );
    }
  }
}
