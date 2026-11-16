'use client';

import { FC, useEffect, useState } from 'react';
import { useCustomProviderFunction } from '@gitroom/frontend/components/launches/helpers/use.custom.provider.function';
import { Select } from '@gitroom/react/form/select';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

export const DiscourseCategorySelect: FC<{
  name: string;
  onChange: (event: {
    target: {
      value: string;
      name: string;
    };
  }) => void;
}> = (props) => {
  const { onChange, name } = props;
  const t = useT();
  const customFunc = useCustomProviderFunction();
  const [items, setItems] = useState([]);
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
    customFunc.get('categories').then((data) => setItems(data || []));
    const settings = getValues()[props.name];
    if (settings) {
      setCurrent(settings);
    }
  }, []);

  if (!items.length) {
    return null;
  }

  return (
    <Select
      name={name}
      label="Select Category"
      onChange={onChangeInner}
      value={current}
    >
      <option value="">{t('select_1', '--Select--')}</option>
      {items.map((item: any) => (
        <option key={item.id} value={item.id}>
          {item.name}
        </option>
      ))}
    </Select>
  );
};
