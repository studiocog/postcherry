'use client';

import React, { DragEvent, FC, useCallback, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import {
  useAdminAction,
  useAdminBoard,
} from '@gitroom/frontend/components/admin/admin.hooks';
import {
  HealthBadge,
  Loading,
  money,
  stageLabels,
  StatusBadge,
} from '@gitroom/frontend/components/admin/admin.ui';
import { AdminStage } from '@gitroom/nestjs-libraries/dtos/admin/admin.dto';

// The pipeline: a column per stage, drag a workspace to another stage
export const AdminPipelineComponent: FC = () => {
  const { data, error, mutate } = useAdminBoard();
  const action = useAdminAction();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<AdminStage | null>(null);

  const drop = useCallback(
    async (e: DragEvent, stage: AdminStage) => {
      e.preventDefault();
      setOver(null);
      const id = e.dataTransfer.getData('text/plain');
      setDragging(null);
      const card = data?.stages
        .flatMap((column) => column.customers)
        .find((customer) => customer.id === id);
      if (!card || card.stage === stage) {
        return;
      }
      if (await action(`/admin/customers/${id}/stage`, 'PUT', { stage })) {
        mutate();
      }
    },
    [data]
  );

  if (error && !data) {
    return <div className="text-red-400">{error.message}</div>;
  }
  if (!data) {
    return <Loading />;
  }

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="flex flex-wrap items-baseline justify-between gap-[8px]">
        <div className="text-[22px] font-[600]">Pipeline</div>
        <div className="text-[13px] opacity-70">
          Drag a workspace to another stage. &quot;auto&quot; = worked out from
          its plan and posting.
        </div>
      </div>
      <div className="flex gap-[12px] overflow-x-auto pb-[8px]">
        {data.stages.map((column) => (
          <div
            key={column.stage}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(column.stage);
            }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => drop(e, column.stage)}
            className={clsx(
              'w-[260px] shrink-0 flex flex-col gap-[8px] rounded-[12px] border p-[8px] bg-newBgColor',
              over === column.stage
                ? 'border-forth'
                : 'border-newTableBorder'
            )}
          >
            <div className="flex items-center justify-between px-[4px] pt-[2px]">
              <div className="text-[14px] font-[600]">
                {stageLabels[column.stage]}
              </div>
              <div className="text-[12px] opacity-60">{column.total}</div>
            </div>
            {column.customers.map((customer) => (
              <div
                key={customer.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', customer.id);
                  setDragging(customer.id);
                }}
                onDragEnd={() => setDragging(null)}
                className={clsx(
                  'rounded-[10px] border border-newTableBorder bg-newBgColorInner p-[10px] flex flex-col gap-[6px] cursor-grab active:cursor-grabbing',
                  dragging === customer.id && 'opacity-50'
                )}
              >
                <div className="flex items-start justify-between gap-[6px]">
                  <Link
                    href={`/admin/customers/${customer.id}`}
                    className="text-[14px] font-[600] hover:underline break-words min-w-0"
                  >
                    {customer.name}
                  </Link>
                  <HealthBadge health={customer.health} />
                </div>
                <div className="text-[12px] opacity-70 truncate">
                  {customer.owner?.email || 'No owner'}
                </div>
                <div className="flex flex-wrap items-center gap-[6px] text-[12px]">
                  <StatusBadge status={customer.status} />
                  {!!customer.monthlyRevenue && (
                    <span className="font-[600]">
                      {money(customer.monthlyRevenue)}/mo
                    </span>
                  )}
                  {!customer.stageSet && (
                    <span className="opacity-50">auto</span>
                  )}
                </div>
              </div>
            ))}
            {column.total > column.customers.length && (
              <Link
                href={`/admin/customers?stage=${column.stage}`}
                className="text-[12px] text-forth px-[4px]"
              >
                +{column.total - column.customers.length} more →
              </Link>
            )}
            {column.total === 0 && (
              <div className="text-[12px] opacity-50 px-[4px] py-[8px]">
                Drop a workspace here
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
