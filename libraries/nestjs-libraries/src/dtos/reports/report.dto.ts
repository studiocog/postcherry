import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

// Shared with the reports page, so it can stop a range the server would refuse
export const reportLimits = {
  maxDays: 366,
  channels: 200,
} as const;

export class ReportRequestDto {
  // ISO dates, computed in the browser in the timezone of the user
  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  // missing or empty means every channel of the workspace
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(reportLimits.channels)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  integrations?: string[];

  // IANA timezone, only used to print the dates in the report
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;
}

export class EmailReportDto extends ReportRequestDto {
  // exactly one recipient
  @IsEmail()
  @MaxLength(254)
  to: string;
}

export type EmailReportResult =
  | { sent: true }
  | { sent: false; reason: 'not_configured' | 'failed' };
