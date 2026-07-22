import WidgetClient from './WidgetClient';

export default async function WidgetPage({
  params,
  searchParams,
}: {
  params: Promise<{ widgetKey: string }>;
  searchParams: Promise<{ visitorToken?: string; pageUrl?: string }>;
}) {
  const { widgetKey } = await params;
  const { visitorToken = '', pageUrl = '' } = await searchParams;

  return (
    <WidgetClient
      widgetKey={widgetKey}
      visitorToken={visitorToken}
      pageUrl={pageUrl}
    />
  );
}
