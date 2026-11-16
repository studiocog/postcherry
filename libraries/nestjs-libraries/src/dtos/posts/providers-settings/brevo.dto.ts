import { IsDefined, IsString, MinLength } from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';

export class BrevoDto {
  @IsString()
  @MinLength(1)
  @IsDefined()
  subject: string;

  @IsString()
  @MinLength(1)
  @IsDefined()
  @JSONSchema({
    description: 'List must be an id',
  })
  list: string;

  @IsString()
  @MinLength(1)
  @IsDefined()
  @JSONSchema({
    description: 'Sender must be an id',
  })
  sender: string;
}
