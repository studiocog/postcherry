'use client';

import React, { FC, useCallback, useMemo } from 'react';
import { orderBy } from 'lodash';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import ImageWithFallback from '@gitroom/react/helpers/image.with.fallback';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import { EditGroupNameModal } from '@gitroom/frontend/components/launches/launches.component';
import {
  Brand,
  useBrands,
} from '@gitroom/frontend/components/brands/brand.context';
import {
  BrandAvatar,
  BrandLimitNotice,
  useAddBrand,
} from '@gitroom/frontend/components/brands/brand.switcher';

interface BrandChannel {
  id: string;
  name: string;
  picture: string;
  identifier: string;
  disabled?: boolean;
  customer?: { id?: string; name?: string };
}

const BrandChannels: FC<{
  channels: BrandChannel[];
  brands: Brand[];
  move: (channel: BrandChannel, brand: string) => void;
}> = ({ channels, brands, move }) => {
  const t = useT();
  if (!channels.length) {
    return (
      <div className="text-[14px] text-textItemBlur">
        {t(
          'brand_no_channels',
          'No channels yet. Select this brand and click Add Channel to connect its social accounts.'
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-[8px]">
      {channels.map((channel) => (
        <div
          key={channel.id}
          className="flex items-center gap-[12px] mobile:flex-wrap"
        >
          <ImageWithFallback
            fallbackSrc={`/icons/platforms/${channel.identifier}.png`}
            src={channel.picture}
            className="rounded-[8px] min-w-[32px]"
            alt={channel.identifier}
            width={32}
            height={32}
          />
          <div className="flex-1 min-w-0 text-[14px] truncate">
            {channel.name}
            {channel.disabled && (
              <span className="text-textItemBlur">
                {' '}
                ({t('disabled', 'Disabled')})
              </span>
            )}
          </div>
          <select
            aria-label={t('move_to_brand', 'Move to brand')}
            value={channel.customer?.id || ''}
            onChange={(e) => move(channel, e.target.value)}
            className="h-[36px] max-w-[220px] bg-newBgColorInner px-[12px] outline-none border-newTableBorder border rounded-[8px] text-[14px]"
          >
            <option value="">{t('no_brand', 'No brand')}</option>
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
};

// Settings > Brands: the brands of the workspace and their channels
export const BrandsSettings: FC = () => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const modals = useModals();
  const addBrand = useAddBrand();
  const { brands, limit, canAdd, reload, current, setCurrent } = useBrands();
  const { data: integrations, mutate: mutateIntegrations } =
    useIntegrationList();

  const byBrand = useMemo(() => {
    const list = orderBy(
      (Array.isArray(integrations) ? integrations : []) as BrandChannel[],
      ['identifier', 'name'],
      ['asc', 'asc']
    );
    return list.reduce((all, channel) => {
      const key = channel.customer?.id || '';
      (all[key] = all[key] || []).push(channel);
      return all;
    }, {} as Record<string, BrandChannel[]>);
  }, [integrations]);

  const move = useCallback(
    async (channel: BrandChannel, brand: string) => {
      const response = await fetch(`/integrations/${channel.id}/group`, {
        method: 'PUT',
        body: JSON.stringify({ group: brand }),
      });
      if (!response.ok) {
        toaster.show(
          t('could_not_move_channel', 'Could not move the channel.'),
          'warning'
        );
        return;
      }
      await mutateIntegrations();
      toaster.show(t('channel_moved', 'Channel moved'), 'success');
    },
    [mutateIntegrations]
  );

  const rename = useCallback(
    (brand: Brand) => async () => {
      const value: string | undefined = await new Promise((resolve) => {
        modals.openModal({
          title: t('edit_group_name', 'Rename brand'),
          onClose: () => resolve(undefined),
          children: (close) => (
            <EditGroupNameModal
              name={brand.name}
              id={brand.id}
              close={close}
              resolve={resolve}
            />
          ),
        });
      });
      if (!value) {
        return;
      }
      await reload();
      toaster.show(t('group_updated', 'Brand updated'), 'success');
    },
    [modals, reload]
  );

  const remove = useCallback(
    (brand: Brand) => async () => {
      const count = byBrand[brand.id]?.length || 0;
      if (
        !(await deleteDialog(
          t(
            'delete_brand_confirm',
            'Delete the brand "{{name}}"? Its {{count}} channels stay connected, they just will not belong to a brand anymore.',
            { name: brand.name, count }
          ),
          t('delete_brand', 'Delete brand'),
          t('delete_brand_title', 'Delete brand?'),
          undefined,
          true
        ))
      ) {
        return;
      }
      const response = await fetch(`/integrations/customers/${brand.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        toaster.show(
          t('could_not_delete_brand', 'Could not delete the brand.'),
          'warning'
        );
        return;
      }
      if (current === brand.id) {
        setCurrent('');
      }
      await reload();
      toaster.show(t('brand_deleted', 'Brand deleted'), 'success');
    },
    [byBrand, current, setCurrent, reload]
  );

  const withoutBrand = byBrand[''] || [];

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="flex items-start gap-[16px] mobile:flex-col">
        <div className="flex-1 flex flex-col gap-[4px]">
          <h3 className="text-[20px]">{t('brands', 'Brands')}</h3>
          <div className="text-[14px] text-textItemBlur">
            {t(
              'brands_description',
              'A brand groups the social accounts of one business or client. Pick a brand in the top bar to see only its calendar, channels and analytics. A channel you connect while a brand is selected joins that brand.'
            )}
          </div>
          {limit !== null && (
            <div className="text-[14px] font-[600]">
              {t('plan_brands_used', '{{used}} of {{limit}} brands', {
                used: brands.length,
                limit,
              })}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-[6px] mobile:items-start">
          <button
            type="button"
            disabled={!canAdd}
            onClick={addBrand}
            className="h-[40px] px-[16px] rounded-[8px] bg-btnPrimary text-white text-[14px] font-[600] hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
          >
            + {t('add_brand', 'Add brand')}
          </button>
          {!canAdd && <BrandLimitNotice />}
        </div>
      </div>
      {!brands.length && (
        <div className="rounded-[12px] border border-dashed border-newTableBorder p-[24px] text-[14px] text-textItemBlur">
          {t(
            'no_brands_yet',
            'You have no brands yet, all your channels are in one place. Add a brand to group the channels of a business or client.'
          )}
        </div>
      )}
      {brands.map((brand) => (
        <div
          key={brand.id}
          className="rounded-[12px] border border-newTableBorder bg-newBgColorInner p-[20px] mobile:p-[16px] flex flex-col gap-[16px]"
        >
          <div className="flex items-center gap-[12px]">
            <BrandAvatar name={brand.name} size={36} />
            <div className="flex-1 min-w-0">
              <div className="text-[16px] font-[600] truncate">
                {brand.name}
              </div>
              <div className="text-[13px] text-textItemBlur">
                {t('brand_channels_count', '{{count}} channels', {
                  count: byBrand[brand.id]?.length || 0,
                })}
              </div>
            </div>
            <button
              type="button"
              onClick={rename(brand)}
              className="h-[34px] px-[12px] rounded-[8px] bg-btnSimple text-btnText text-[13px] font-[500] hover:opacity-80"
            >
              {t('rename', 'Rename')}
            </button>
            <button
              type="button"
              onClick={remove(brand)}
              className="h-[34px] px-[12px] rounded-[8px] border border-red-500/40 text-red-500 text-[13px] font-[500] hover:bg-red-500/10"
            >
              {t('delete', 'Delete')}
            </button>
          </div>
          <BrandChannels
            channels={byBrand[brand.id] || []}
            brands={brands}
            move={move}
          />
        </div>
      ))}
      {!!brands.length && !!withoutBrand.length && (
        <div className="rounded-[12px] border border-dashed border-newTableBorder p-[20px] mobile:p-[16px] flex flex-col gap-[16px]">
          <div className="flex flex-col gap-[2px]">
            <div className="text-[16px] font-[600]">
              {t('reports_no_customer', 'Without a brand')}
            </div>
            <div className="text-[13px] text-textItemBlur">
              {t(
                'without_brand_description',
                'These channels show only when All brands is selected. Move them to a brand.'
              )}
            </div>
          </div>
          <BrandChannels channels={withoutBrand} brands={brands} move={move} />
        </div>
      )}
    </div>
  );
};
