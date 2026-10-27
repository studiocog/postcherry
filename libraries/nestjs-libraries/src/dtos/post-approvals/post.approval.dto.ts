import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreatePostApprovalDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  clientName?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  expiresInDays?: number;
}

export class PostApprovalDecisionDto {
  @IsIn(['APPROVED', 'CHANGES_REQUESTED'])
  decision: 'APPROVED' | 'CHANGES_REQUESTED';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;
}

export class PostApprovalStatusesDto {
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  postIds: string[];
}
