import { IsDefined, IsOptional, IsString, MinLength } from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';

export class DiscourseDto {
  // The forum decides the real minimum (min_topic_title_length, 15 by
  // default) and answers with a readable error when it is too short.
  @IsString()
  @MinLength(1)
  @IsDefined()
  title: string;

  @IsString()
  @IsOptional()
  @JSONSchema({
    description:
      'Category must be an id from the categories list, the forum default category is used when empty',
  })
  category?: string;
}
