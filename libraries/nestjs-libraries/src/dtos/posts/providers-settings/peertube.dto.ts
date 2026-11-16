import {
  IsDefined,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';

export class PeertubeDto {
  // PeerTube video names are 3 to 120 characters
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  @IsDefined()
  title: string;

  @IsString()
  @IsOptional()
  @JSONSchema({
    description:
      'Channel must be an id from the channels list, the first channel of the account is used when empty',
  })
  channel?: string;
}
