"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CandlestickChart, LineChart } from "lucide-react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  LineSeries,
  type UTCTimestamp,
} from "lightweight-charts";
import { normalizeCandles } from "@/lib/market-data/candles";
import { CANDLE_INTERVALS, type CandleInterval } from "@/lib/market-data/intervals";
import type { Candle, MarketDataResult } from "@/types/market";

type ChartType = "candles" | "line";

interface MarketChartProps {
  result: MarketDataResult<Candle[]>;
  interval: CandleInterval;
}

const UP_COLOR = "#3cc4ae";
const DOWN_COLOR = "#f07ca0";
const VOLUME_PANE_HEIGHT = 96;

export function MarketChart({ result, interval }: MarketChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartType, setChartType] = useState<ChartType>("candles");

  const candles = useMemo(() => {
    if (result.status !== "live" || !result.data) return [];

    return normalizeCandles(result.data).map((candle) => ({
      ...candle,
      time: candle.time as UTCTimestamp,
    }));
  }, [result]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || candles.length === 0) return;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: {
          type: ColorType.Solid,
          color: "#1a2133",
        },
        textColor: "#9aa3ba",
        attributionLogo: true,
        fontFamily: "IBM Plex Sans, system-ui, sans-serif",
        panes: { separatorColor: "rgba(154, 163, 186, 0.2)" },
      },
      grid: {
        vertLines: { color: "rgba(154, 163, 186, 0.08)" },
        horzLines: { color: "rgba(154, 163, 186, 0.08)" },
      },
      rightPriceScale: {
        borderColor: "rgba(154, 163, 186, 0.2)",
      },
      timeScale: {
        borderColor: "rgba(154, 163, 186, 0.2)",
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        vertLine: { color: "#596273", width: 1, style: 2 },
        horzLine: { color: "#596273", width: 1, style: 2 },
      },
    });

    if (chartType === "candles") {
      const series = chart.addSeries(CandlestickSeries, {
        upColor: UP_COLOR,
        downColor: DOWN_COLOR,
        borderUpColor: UP_COLOR,
        borderDownColor: DOWN_COLOR,
        wickUpColor: UP_COLOR,
        wickDownColor: DOWN_COLOR,
        // The axis already labels this level; a second label on top of it only collides.
        lastValueVisible: false,
        priceLineVisible: false,
      });
      series.setData(candles);
    } else {
      const series = chart.addSeries(LineSeries, { color: "#9c8cff", lineWidth: 2, lastValueVisible: false, priceLineVisible: false });
      series.setData(candles.map(({ time, close }) => ({ time, value: close })));
    }

    const volumeBars = candles.flatMap(({ time, open, close, volume }) =>
      volume === null
        ? []
        : [{ time, value: volume, color: close >= open ? "rgba(60, 196, 174, .45)" : "rgba(240, 124, 160, .45)" }],
    );

    if (volumeBars.length > 0) {
      const volumeSeries = chart.addSeries(
        HistogramSeries,
        { priceFormat: { type: "volume" }, priceLineVisible: false, lastValueVisible: false },
        1,
      );
      volumeSeries.setData(volumeBars);
      // Head-room keeps the volume axis labels clear of the price pane above.
      volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.3, bottom: 0 } });
      chart.panes()[1]?.setHeight(VOLUME_PANE_HEIGHT);
    }

    chart.timeScale().fitContent();

    const resizeObserver = new ResizeObserver(() => {
      if (container.clientWidth > 0 && container.clientHeight > 0) {
        chart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
      }
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [candles, chartType]);

  const hasCandles = candles.length > 0;

  let statusMessage = "Clearing prices will appear here once batches have traded.";

  if (result.status === "loading") {
    statusMessage = "Loading verified market data…";
  } else if (result.status === "error") {
    statusMessage = result.message ?? "Unable to load market data.";
  } else if (result.status === "unavailable") {
    statusMessage =
      result.message ?? "No verified price feed is connected.";
  } else if (!hasCandles) {
    statusMessage = "No valid candle data is available for this market.";
  }

  return (
    <>
      <div className="chart-toolbar">
        <nav className="chart-toolbar-group" aria-label="Candle interval">
          {CANDLE_INTERVALS.map((option) => (
            <Link
              key={option}
              href={`/?view=history&interval=${option}`}
              scroll={false}
              className={`chart-tool ${option === interval ? "chart-tool--active" : ""}`}
              aria-current={option === interval ? "true" : undefined}
            >
              {option}
            </Link>
          ))}
        </nav>
        {hasCandles && (
          <div className="chart-toolbar-group" role="group" aria-label="Chart type">
            <button type="button" className={`chart-tool ${chartType === "candles" ? "chart-tool--active" : ""}`} aria-pressed={chartType === "candles"} onClick={() => setChartType("candles")}>
              <CandlestickChart size={14} /> Candles
            </button>
            <button type="button" className={`chart-tool ${chartType === "line" ? "chart-tool--active" : ""}`} aria-pressed={chartType === "line"} onClick={() => setChartType("line")}>
              <LineChart size={14} /> Line
            </button>
          </div>
        )}
      </div>

      {hasCandles ? (
        <div ref={containerRef} className="market-chart-canvas" aria-label="Clearing price and volume chart" />
      ) : (
        <div className="market-chart-state" role="status">
          <strong>No price history yet</strong>
          <span>{statusMessage}</span>
        </div>
      )}

      <p className="market-chart-footer">
        <span>{hasCandles ? `${candles.length} ${interval} candle${candles.length === 1 ? "" : "s"}` : `${interval} interval`}</span>
        <span>{hasCandles && result.message ? result.message : ""}</span>
      </p>
    </>
  );
}
