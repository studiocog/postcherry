'use client';

import { FC, useEffect, useState } from 'react';
import { Select } from '@gitroom/react/form/select';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useCustomProviderFunction } from '@gitroom/frontend/components/launches/helpers/use.custom.provider.function';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';

// A select filled by a provider @Tool function (like listmonk's SelectList),
// shared by the providers that connect with an API key and only need the
// function name and the label to change.
export const ProviderFunctionSelect: FC<{
  name: string;
  label: string;
  func: string;
  onChange: (event: {
    target: {
      value: string;
      name: string;
    };
  }) => void;
}> = (props) => {
  const { onChange, name, label, func } = props;
  const t = useT();
  const customFunc = useCustomProviderFunction();
  const [options, setOptions] = useState<Array<{ id: string; name: string }>>(
    []
  );
  const { getValues } = useSettings();
  const [current, setCurrent] = useState<string | undefined>();
  const onChangeInner = (event: {
    target: {
      value: string;
      name: string;
    };
  }) => {
    setCurrent(event.target.value);
    onChange(event);
  };
  useEffect(() => {
    customFunc
      .get(func)
      .then((data) => setOptions(Array.isArray(data) ? data : []));
    const settings = getValues()[name];
    if (settings) {
      setCurrent(settings);
    }
  }, []);
  if (!options.length) {
    return null;
  }
  return (
    <Select name={name} label={label} onChange={onChangeInner} value={current}>
      <option value="">{t('select_1', '--Select--')}</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.name}
        </option>
      ))}
    </Select>
  );
};
