import { IsDefined, IsString, MinLength } from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';

export class NotionDto {
  @IsString()
  @MinLength(1)
  @IsDefined()
  @JSONSchema({
    description: 'Database must be an id',
  })
  database: string;

  @IsString()
  @MinLength(1)
  @IsDefined()
  title: string;
}
