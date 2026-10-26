import {
  Equals,
  IsArray,
  IsDefined,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  registerDecorator,
  ValidateNested,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { MediaDto } from '@gitroom/nestjs-libraries/dtos/media/media.dto';
import { Type } from 'class-transformer';
import { JSONSchema } from 'class-validator-jsonschema';

// YouTube caps the combined length of all tags at 500 characters.
// Tags containing whitespace are wrapped in quotes by YouTube, which adds
// two extra characters per tag toward that limit.
export const YOUTUBE_TAGS_MAX_LENGTH = 500;

export function getYoutubeTagsLength(tags: YoutubeTagsSettings[]): number {
  return (tags ?? []).reduce((total, tag) => {
    const label = tag?.label ?? '';
    return total + label.length + (/\s/.test(label) ? 2 : 0);
  }, 0);
}

@ValidatorConstraint({ name: 'IsYoutubeTagsLength', async: false })
export class IsYoutubeTagsLengthConstraint
  implements ValidatorConstraintInterface
{
  validate(value: unknown, _args: ValidationArguments): boolean {
    if (!Array.isArray(value)) {
      return true;
    }
    return getYoutubeTagsLength(value) <= YOUTUBE_TAGS_MAX_LENGTH;
  }

  defaultMessage(_args: ValidationArguments): string {
    return `The maximum allowed is ${YOUTUBE_TAGS_MAX_LENGTH} characters in total for all tags.`;
  }
}

export function IsYoutubeTagsLength(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: IsYoutubeTagsLengthConstraint,
    });
  };
}

export class YoutubeTagsSettings {
  @IsString()
  value: string;

  @IsString()
  label: string;
}

export class YoutubeSettingsDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @IsDefined()
  title: string;

  // YouTube API policy: the privacy status is always an explicit choice of
  // the user, there is no default.
  @IsIn(['public', 'private', 'unlisted'], {
    message: 'Choose the video privacy (public, private or unlisted)',
  })
  @IsDefined({
    message: 'Choose the video privacy (public, private or unlisted)',
  })
  @JSONSchema({
    description:
      'Who can see the video. Must be chosen by the user, never assumed.',
  })
  type: string;

  // Required for new and edited posts. Posts saved before this was required
  // are not validated again when they publish, and the provider still treats
  // a missing value as "no" for them.
  @IsIn(['yes', 'no'], {
    message: 'Choose whether the video is made for kids',
  })
  @IsDefined({
    message: 'Choose whether the video is made for kids',
  })
  @JSONSchema({
    description:
      'Whether the video is made for kids. Must be chosen by the user, never assumed.',
  })
  selfDeclaredMadeForKids: 'no' | 'yes';

  // The user confirms the video follows the YouTube Community Guidelines.
  // Same backward compatibility as selfDeclaredMadeForKids.
  @Equals(true, {
    message:
      'Confirm that the video follows the YouTube Community Guidelines',
  })
  @JSONSchema({
    description:
      'Must be true: the user confirms the video follows the YouTube Community Guidelines (https://www.youtube.com/howyoutubeworks/policies/community-guidelines/). Ask the user, never set it on their behalf.',
  })
  communityGuidelines: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => MediaDto)
  thumbnail?: MediaDto;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @IsYoutubeTagsLength()
  @Type(() => YoutubeTagsSettings)
  tags: YoutubeTagsSettings[];
}
