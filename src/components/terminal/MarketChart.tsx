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

const UP_COLOR = "#2ebd85";
const DOWN_COLOR = "#f0556a";
const VOLUME_PANE_HEIGHT = 84;

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
          color: "#12161c",
        },
        textColor: "#848e9c",
        attributionLogo: true,
        panes: { separatorColor: "#1f252e" },
      },
      grid: {
        vertLines: { color: "#181d25" },
        horzLines: { color: "#181d25" },
      },
      rightPriceScale: {
        borderColor: "#1f252e",
      },
      timeScale: {
        borderColor: "#1f252e",
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
      });
      series.setData(candles);
    } else {
      const series = chart.addSeries(LineSeries, { color: "#9c8cff", lineWidth: 2 });
      series.setData(candles.map(({ time, close }) => ({ time, value: close })));
    }

    const volumeBars = candles.flatMap(({ time, open, close, volume }) =>
      volume === null
        ? []
        : [{ time, value: volume, color: close >= open ? "rgba(46, 189, 133, .5)" : "rgba(240, 85, 106, .5)" }],
    );

    if (volumeBars.length > 0) {
      const volumeSeries = chart.addSeries(
        HistogramSeries,
        { priceFormat: { type: "volume" }, priceLineVisible: false, lastValueVisible: false },
        1,
      );
      volumeSeries.setData(volumeBars);
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

  let statusMessage = "Historical prices will appear here.";

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
    <section className="panel market-chart-panel">
      <div className="market-chart-header">
        <div>
          <h2 className="market-chart-title">Market overview</h2>
          <p className="market-chart-subtitle">
            Batch-clearing price history
          </p>
        </div>
        <span className="market-chart-source">
          {hasCandles ? "Read from the contract" : "Feed unavailable"}
        </span>
      </div>

      <div className="chart-toolbar">
        <nav className="chart-toolbar-group" aria-label="Candle interval">
          {CANDLE_INTERVALS.map((option) => (
            <Link
              key={option}
              href={`/?interval=${option}`}
              scroll={false}
              className={`chart-tool ${option === interval ? "chart-tool--active" : ""}`}
              aria-current={option === interval ? "true" : undefined}
            >
              {option}
            </Link>
          ))}
        </nav>
        <div className="chart-toolbar-group" role="group" aria-label="Chart type">
          <button
            type="button"
            className={`chart-tool ${chartType === "candles" ? "chart-tool--active" : ""}`}
            aria-pressed={chartType === "candles"}
            disabled={!hasCandles}
            onClick={() => setChartType("candles")}
          >
            <CandlestickChart size={13} /> Candles
          </button>
          <button
            type="button"
            className={`chart-tool ${chartType === "line" ? "chart-tool--active" : ""}`}
            aria-pressed={chartType === "line"}
            disabled={!hasCandles}
            onClick={() => setChartType("line")}
          >
            <LineChart size={13} /> Line
          </button>
        </div>
      </div>

      {hasCandles ? (
        <div
          ref={containerRef}
          className="market-chart-canvas"
          aria-label="Market price and volume chart"
        />
      ) : (
        <div className="market-chart-state" role="status">
          <strong>Price history unavailable</strong>
          <p>{statusMessage}</p>
        </div>
      )}

      <div className="market-chart-footer">
        <span>{hasCandles && result.message ? result.message : "Source: market data adapter"} · {interval} interval</span>
        <span>
          {hasCandles
            ? `${candles.length} candles`
            : "Awaiting a connected data source"}
        </span>
      </div>
    </section>
  );
}
