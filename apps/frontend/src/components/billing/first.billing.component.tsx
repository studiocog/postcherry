'use client';

import React, { FC, useCallback, useEffect, useMemo, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import { OrganizationSelector } from '@gitroom/frontend/components/layout/organization.selector';
import { LanguageComponent } from '@gitroom/frontend/components/layout/language.component';
import { AttachToFeedbackIcon } from '@gitroom/frontend/components/new-layout/sentry.feedback.component';
import NotificationComponent from '@gitroom/frontend/components/notifications/notification.component';
import dynamic from 'next/dynamic';
import { LogoTextComponent } from '@gitroom/frontend/components/ui/logo-text.component';
import {
  isNewTier,
  PLAN_GROUPS,
  POPULAR_PLAN,
  pricing,
} from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';
import clsx from 'clsx';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import {
  FAQComponent,
  FAQSection,
} from '@gitroom/frontend/components/billing/faq.component';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { useDubClickId } from '@gitroom/frontend/components/layout/dubAnalytics';
import useCookie from 'react-use-cookie';
import { LogoutComponent } from '@gitroom/frontend/components/layout/logout.component';
import { DeveloperIconComponent } from '@gitroom/frontend/components/developer/developer.icon.component';
import { TermsLinks } from '@gitroom/frontend/components/auth/terms.notice';
import {
  PlanView,
  usePlanName,
  useVisiblePlans,
} from '@gitroom/frontend/components/billing/use.plans';
import { PlanAudienceTabs } from '@gitroom/frontend/components/billing/plan.audience.tabs';
import {
  AccountType,
  AccountTypePicker,
  useAccountType,
  useSaveAccountType,
} from '@gitroom/frontend/components/settings/account-type.component';

const ModeComponent = dynamic(
  () => import('@gitroom/frontend/components/layout/mode.component'),
  {
    ssr: false,
  }
);

const EmbeddedBilling = dynamic(
  () =>
    import('@gitroom/frontend/components/billing/embedded.billing').then(
      (mod) => mod.EmbeddedBilling
    ),
  {
    ssr: false,
  }
);

export const FirstBillingComponent = () => {
  const { stripeClient } = useVariables();
  const user = useUser();
  const dub = useDubClickId();
  const [stripe, setStripe] = useState<null | Promise<Stripe>>(null);
  const [stripeFailed, setStripeFailed] = useState(false);
  const { view, setView, plans, popular } = useVisiblePlans();
  const planName = usePlanName();
  const [tier, setTier] = useState<string>(() =>
    view === 'ALL' ? POPULAR_PLAN.AGENCY : POPULAR_PLAN[view]
  );
  const [period, setPeriod] = useState('MONTHLY');
  const fetch = useFetch();
  const { mutate } = useSWRConfig();
  const t = useT();
  const { accountType } = useAccountType();
  const saveAccountType = useSaveAccountType();
  // a new workspace has no account type yet: it's asked first, so the plans
  // shown and the checkout loaded are the ones made for it (a team member
  // can't set it, they get the default view)
  const [askAccountType, setAskAccountType] = useState(
    () => !accountType && !!user?.role && user.role !== 'USER'
  );
  const [datafast_visitor_id] = useCookie('datafast_visitor_id', '');
  const [datafast_session_id] = useCookie('datafast_session_id', '');

  useEffect(() => {
    const stripePromise = loadStripe(stripeClient);
    stripePromise.catch(() => setStripeFailed(true));
    setStripe(stripePromise);
  }, []);

  const loadCheckout = useCallback(async () => {
    return (
      await fetch('/billing/embedded', {
        method: 'POST',
        body: JSON.stringify({
          billing: tier,
          period: period,
          ...(datafast_visitor_id && datafast_session_id
            ? { datafast_visitor_id, datafast_session_id }
            : {}),
          ...(dub ? { dub } : {}),
        }),
      })
    ).json();
  }, [tier, period]);

  const { data, isLoading } = useSWR(
    askAccountType ? null : `/billing-${tier}-${period}`,
    loadCheckout,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      refreshWhenOffline: false,
      refreshWhenHidden: false,
    }
  );

  useEffect(() => {
    if (data?.blocked) {
      mutate('/user/self');
    }
  }, [data?.blocked, mutate]);

  // another audience selects its most popular plan, unless the selected plan is in it
  const changeView = useCallback(
    (value: PlanView) => {
      setView(value);
      if (
        value !== 'ALL' &&
        !(PLAN_GROUPS[value] as string[]).includes(tier)
      ) {
        setTier(POPULAR_PLAN[value]);
      }
    },
    [tier]
  );

  // the plans of the chosen account type show right away, saving it can't block the checkout
  const chooseAccountType = useCallback(
    async (type: AccountType) => {
      changeView(type);
      setAskAccountType(false);
      try {
        await saveAccountType(type);
      } catch (err) {
        /** the plans are already shown **/
      }
    },
    [changeView, saveAccountType]
  );

  const JoinOver = () => {
    return (
      <div className="flex flex-col gap-[16px]">
        <div className="text-[34px] font-[700] leading-[115%] tracking-[-0.01em] tablet:text-[30px] mobile:!text-[26px] text-balance">
          {t('billing_postcherry_headline', 'The cherry on top of your')}{' '}
          <span className="text-[#D21F3C]">
            {t('billing_postcherry_headline_accent', 'social media')}
          </span>
        </div>

        {!!user?.allowTrial && (
          <div className="flex flex-wrap gap-x-[24px] gap-y-[8px] text-[14px] font-[500] text-textItemBlur">
            {[
              t('billing_no_risk_trial', '100% No-Risk Free Trial'),
              t('billing_pay_nothing_7_days', 'Pay nothing for 7 days'),
              t('billing_cancel_anytime', 'Cancel anytime, from settings'),
            ].map((item) => (
              <div key={item} className="flex items-center gap-[6px]">
                <TickIcon />
                <span>{item}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="blurMe flex flex-1 flex-col bg-newBgColorInner pb-[40px]">
      <div className="h-[72px] px-[40px] tablet:px-[32px] mobile:!px-[16px] flex border-b border-newColColor">
        <div className="flex-1 flex items-center text-textColor">
          <LogoTextComponent />
        </div>
        <div className="flex items-center">
          <div className="flex gap-[20px] text-textItemBlur">
            <OrganizationSelector />
            <div className="hover:text-newTextColor">
              <ModeComponent />
            </div>
            <div className="w-[1px] h-[20px] bg-blockSeparator" />
            <LanguageComponent />
            <div className="w-[1px] h-[20px] bg-blockSeparator" />
            <AttachToFeedbackIcon />
            <DeveloperIconComponent />
            {/*<NotificationComponent />*/}
            <div className="hover:text-newTextColor">
              {user?.tier.current === 'FREE' && (
                <LogoutComponent isIcon={true} />
              )}
            </div>
          </div>
        </div>
      </div>
      {askAccountType ? (
        <div className="flex flex-col items-center gap-[40px] px-[80px] tablet:px-[32px] mobile:!px-[16px] py-[60px] mobile:py-[32px]">
          <div className="flex flex-col items-center text-center">
            <JoinOver />
          </div>
          <div className="flex flex-col items-center gap-[24px] w-full">
            <div className="flex flex-col items-center gap-[8px] text-center">
              <div className="text-[24px] font-[700]">
                {t('billing_who_is_it_for', 'Who will use PostCherry?')}
              </div>
              <div className="text-[16px] text-textItemBlur">
                {t(
                  'billing_who_is_it_for_description',
                  'We will show you the plans made for you. You can see every plan on the next step.'
                )}
              </div>
            </div>
            <AccountTypePicker value={null} onSelect={chooseAccountType} />
          </div>
        </div>
      ) : (
        // plans on the left, the payment card on the right (stacked on small screens)
        <div className="w-full max-w-[1320px] mx-auto px-[40px] tablet:px-[32px] mobile:!px-[16px] pt-[40px] mobile:pt-[24px] flex items-start gap-[48px] tablet:gap-[32px] tablet:flex-col">
          <div className="flex-1 min-w-0 w-full flex flex-col gap-[32px]">
            <JoinOver />

            <div className="flex flex-col gap-[16px]">
              <div className="flex flex-wrap items-center justify-between gap-[12px]">
                <div className="text-[22px] font-[700]">
                  {t('billing_choose_plan', 'Choose a Plan')}
                </div>
                <div
                  role="group"
                  aria-label={t('billing_period', 'Billing period')}
                  className="flex p-[4px] border border-newTableBorder rounded-[8px] text-[14px] font-[500] select-none"
                >
                  {(['MONTHLY', 'YEARLY'] as const).map((value) => (
                    <button
                      type="button"
                      key={value}
                      aria-pressed={period === value}
                      onClick={() => setPeriod(value)}
                      className={clsx(
                        'h-[34px] px-[16px] rounded-[6px] flex items-center gap-[8px] whitespace-nowrap',
                        period === value
                          ? 'bg-boxFocused text-textItemFocused'
                          : 'cursor-pointer'
                      )}
                    >
                      {value === 'MONTHLY'
                        ? t('billing_monthly', 'Monthly')
                        : t('billing_yearly', 'Yearly')}
                      {value === 'YEARLY' && (
                        <span className="text-[11px] font-[600] px-[6px] py-[1px] rounded-[4px] bg-[#16A34A]/[0.12] text-[#16A34A]">
                          {t('billing_two_months_free', '2 months free')}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
              <PlanAudienceTabs
                value={view}
                onChange={changeView}
                className="w-fit mobile:w-full"
              />
              <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] mobile:!grid-cols-2 gap-[12px] pt-[8px]">
                {plans.map((key) => (
                  <button
                    type="button"
                    onClick={() => setTier(key)}
                    key={key}
                    aria-pressed={key === tier}
                    className={clsx(
                      'relative text-start select-none p-[18px] mobile:p-[14px] rounded-[16px] border-[1.5px] flex flex-col gap-[10px] transition-colors',
                      key === tier
                        ? 'border-[#D21F3C] bg-[#D21F3C]/[0.04]'
                        : 'border-newColColor hover:border-textItemBlur'
                    )}
                  >
                    <div className="flex items-center justify-between gap-[8px] w-full">
                      <div className="text-[16px] font-[600] truncate">
                        {planName(key)}
                      </div>
                      <div
                        className={clsx(
                          'w-[18px] h-[18px] shrink-0 rounded-full border-[1.5px] flex items-center justify-center',
                          key === tier
                            ? 'border-[#D21F3C]'
                            : 'border-newColColor'
                        )}
                      >
                        {key === tier && (
                          <div className="w-[8px] h-[8px] rounded-full bg-[#D21F3C]" />
                        )}
                      </div>
                    </div>
                    <div className="text-[14px] text-textItemBlur">
                      <span className="text-[30px] mobile:text-[24px] font-[700] text-textColor">
                        $
                        {
                          pricing[key][
                            period === 'MONTHLY' ? 'month_price' : 'year_price'
                          ]
                        }
                      </span>{' '}
                      {period === 'MONTHLY'
                        ? t('billing_per_month', '/ month')
                        : t('billing_per_year', '/ year')}
                    </div>
                    {popular.includes(key) && (
                      <div className="absolute -top-[10px] start-[16px] bg-[#D21F3C] text-white text-[11px] font-[600] px-[8px] py-[2px] rounded-full whitespace-nowrap">
                        {t('billing_most_popular', 'Most popular')}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[16px] border border-newColColor p-[24px] mobile:p-[18px] flex flex-col gap-[16px]">
              <div className="text-[18px] font-[700]">
                {t('billing_whats_included', "What's included in")}{' '}
                {planName(tier)}
              </div>
              <BillingFeatures tier={tier} />
            </div>

            <div className="flex flex-col tablet:hidden">
              <FAQComponent />
            </div>
          </div>

          <div className="w-[460px] tablet:w-full shrink-0 sticky top-[24px] tablet:static">
            <div className="rounded-[20px] border border-newColColor bg-newBgColor p-[28px] mobile:p-[18px] shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
              {data?.blocked ? (
                <div className="text-[16px] font-[500]">
                  {t(
                    'billing_other_account_subscribed',
                    'Another account with this email already has an active subscription. Please log off and sign in to that account to manage your subscription.'
                  )}
                </div>
              ) : stripeFailed ? (
                <div className="text-[16px] font-[500]">
                  {t(
                    'billing_stripe_load_failed',
                    'The payment form could not be loaded. Please disable ad blockers or privacy extensions for this page and reload.'
                  )}
                </div>
              ) : !isLoading && data && stripe ? (
                <>
                  <EmbeddedBilling
                    stripe={stripe}
                    secret={data.client_secret}
                    showCoupon={period === 'MONTHLY'}
                    autoApplyCoupon={data.auto_apply_coupon}
                  />
                  <div className="text-[12px] mt-[16px] text-textItemBlur text-center">
                    {t(
                      'by_subscribing_you_agree_to_the',
                      'By subscribing you agree to the'
                    )}
                    &nbsp;
                    <TermsLinks />
                  </div>
                </>
              ) : (
                <div className="min-h-[320px] flex">
                  <LoadingComponent />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const TickIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#16A34A"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

type FeatureItem = {
  key: string;
  defaultValue: string;
  prefix?: string | number;
  values?: Record<string, string | number>;
};

export const useBillingFeatures = (tier: string) => {
  const t = useT();
  const features = useMemo(() => {
    const currentPricing = pricing[tier];
    const channelsOr = currentPricing.channel;
    const list: FeatureItem[] = [];

    // the PostCherry plans list what the website sells, every line is
    // enforced by the plan limits
    if (isNewTier(tier)) {
      list.push(
        currentPricing.brands === 1
          ? {
              key: 'billing_brands_one',
              defaultValue: '1 brand ({{channels}} social accounts)',
              values: { channels: channelsOr },
            }
          : {
              key: 'billing_brands_many',
              defaultValue:
                'Up to {{brands}} brands ({{channels}} social accounts)',
              values: { brands: currentPricing.brands, channels: channelsOr },
            }
      );
      list.push({
        key: 'billing_all_channel_types',
        defaultValue: 'All 30+ channel types',
      });
      list.push(
        currentPricing.team_members
          ? {
              key: 'billing_unlimited_team_members',
              defaultValue: 'Unlimited team members',
            }
          : { key: 'billing_single_user', defaultValue: 'Single user' }
      );
      if (currentPricing.ai) {
        list.push({
          key: 'billing_ai_writing_assistant',
          defaultValue: 'AI writing assistant',
        });
      }
      if (currentPricing.image_generator) {
        list.push({
          key: 'billing_ai_images_per_month',
          defaultValue: 'AI Images per month',
          prefix: currentPricing.image_generation_count,
        });
        list.push({
          key: 'billing_ai_videos_per_month',
          defaultValue: 'AI Videos per month',
          prefix: currentPricing.generate_videos,
        });
        list.push({
          key: 'billing_clipping_minutes_per_month',
          defaultValue: 'minutes of AI video clipping per month',
          prefix: currentPricing.clipping_minutes,
        });
      }
      if (currentPricing.recurring_posts) {
        list.push({
          key: 'billing_recurring_posts',
          defaultValue: 'Recurring posts',
        });
      }
      if (currentPricing.preview_links) {
        list.push({
          key: 'billing_preview_links',
          defaultValue: 'Preview links to share',
        });
      }
      if (currentPricing.autoPost) {
        list.push({
          key: 'billing_rss_auto_posting',
          defaultValue: 'RSS auto-posting',
        });
      }
      if (currentPricing.developer_api) {
        list.push({
          key: 'billing_public_api_webhooks_agents',
          defaultValue: 'Public API, webhooks and AI agent skills',
        });
      }
      list.push({ key: 'billing_analytics', defaultValue: 'Analytics' });
      return list;
    }

    list.push({
      key: channelsOr === 1 ? 'billing_channel' : 'billing_channels',
      defaultValue: channelsOr === 1 ? 'channel' : 'channels',
      prefix: channelsOr,
    });

    list.push({
      key: 'billing_posts_per_month',
      defaultValue: 'posts per month',
      prefix:
        currentPricing.posts_per_month > 10000
          ? 'unlimited'
          : currentPricing.posts_per_month,
    });

    if (currentPricing.team_members) {
      list.push({
        key: 'billing_unlimited_team_members',
        defaultValue: 'Unlimited team members',
      });
    }
    if (currentPricing?.ai) {
      list.push({
        key: 'billing_ai_auto_complete',
        defaultValue: 'AI auto-complete',
      });
      list.push({ key: 'billing_ai_copilots', defaultValue: 'AI copilots' });
      list.push({
        key: 'billing_ai_autocomplete',
        defaultValue: 'AI Autocomplete',
      });
    }
    list.push({
      key: 'billing_advanced_picture_editor',
      defaultValue: 'Advanced Picture Editor',
    });
    if (currentPricing?.image_generator) {
      list.push({
        key: 'billing_ai_images_per_month',
        defaultValue: 'AI Images per month',
        prefix: currentPricing?.image_generation_count,
      });
    }
    if (currentPricing?.generate_videos) {
      list.push({
        key: 'billing_ai_videos_per_month',
        defaultValue: 'AI Videos per month',
        prefix: currentPricing?.generate_videos,
      });
    }
    if (currentPricing?.clipping_minutes) {
      list.push({
        key: 'billing_clipping_minutes_per_month',
        defaultValue: 'minutes of AI video clipping per month',
        prefix: currentPricing?.clipping_minutes,
      });
    }
    return list;
  }, [tier]);

  const renderFeature = (feature: FeatureItem) => {
    const translatedText = t(
      feature.key,
      feature.defaultValue,
      feature.values || {}
    );
    if (feature.prefix === 'unlimited') {
      return `${t('billing_unlimited', 'Unlimited')} ${translatedText}`;
    }
    if (feature.prefix !== undefined) {
      return `${feature.prefix} ${translatedText}`;
    }
    return translatedText;
  };

  return features.map((feature) => ({
    key: feature.key,
    label: renderFeature(feature),
  }));
};

export const BillingFeatures: FC<{ tier: string }> = ({ tier }) => {
  const features = useBillingFeatures(tier);

  return (
    <div className="grid grid-cols-2 mobile:grid-cols-1 gap-y-[10px] gap-x-[32px] text-[14px]">
      {features.map((feature) => (
        <div key={feature.key} className="flex items-center gap-[8px]">
          <div className="text-[#D21F3C] shrink-0">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="17"
              height="17"
              viewBox="0 0 17 17"
              fill="none"
            >
              <path
                d="M11.825 0H4.84167C1.80833 0 0 1.80833 0 4.84167V11.8167C0 14.8583 1.80833 16.6667 4.84167 16.6667H11.8167C14.85 16.6667 16.6583 14.8583 16.6583 11.825V4.84167C16.6667 1.80833 14.8583 0 11.825 0ZM12.3167 6.41667L7.59167 11.1417C7.475 11.2583 7.31667 11.325 7.15 11.325C6.98333 11.325 6.825 11.2583 6.70833 11.1417L4.35 8.78333C4.10833 8.54167 4.10833 8.14167 4.35 7.9C4.59167 7.65833 4.99167 7.65833 5.23333 7.9L7.15 9.81667L11.4333 5.53333C11.675 5.29167 12.075 5.29167 12.3167 5.53333C12.5583 5.775 12.5583 6.16667 12.3167 6.41667Z"
                fill="currentColor"
              />
            </svg>
          </div>
          <div>{feature.label}</div>
        </div>
      ))}
    </div>
  );
};
