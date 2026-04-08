import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const Module = require("node:module");
const testGlobals = globalThis as typeof globalThis & {
  __psTmpAliasRegistered?: boolean;
  __psOverviewChartMocksRegistered?: boolean;
  __psChartBarProps?: any[];
  __psChartPieProps?: any[];
  __psRouterPushCalls?: string[];
};

if (!testGlobals.__psTmpAliasRegistered) {
  const originalResolveFilename = Module._resolveFilename;
  Module._resolveFilename = function patchedResolveFilename(request: string, parent: unknown, isMain: boolean, options: unknown) {
    if (request.startsWith("@/")) {
      const mapped = path.join(process.cwd(), ".tmp-tests", request.slice(2));
      return originalResolveFilename.call(this, mapped, parent, isMain, options);
    }
    return originalResolveFilename.call(this, request, parent, isMain, options);
  };
  testGlobals.__psTmpAliasRegistered = true;
}

if (!testGlobals.__psOverviewChartMocksRegistered) {
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request: string, parent: unknown, isMain: boolean) {
    if (request === "next/navigation") {
      return {
        useRouter: () => ({
          push: (href: string) => {
            testGlobals.__psRouterPushCalls?.push(href);
          },
        }),
      };
    }
    if (request === "react-chartjs-2") {
      return {
        Bar: (props: any) => {
          testGlobals.__psChartBarProps?.push(props);
          return React.createElement("div", { "data-chart": "bar" });
        },
        Pie: (props: any) => {
          testGlobals.__psChartPieProps?.push(props);
          return React.createElement("div", { "data-chart": "pie" });
        },
      };
    }
    if (request === "chart.js") {
      return {
        Chart: { register: () => undefined },
        CategoryScale: {},
        LinearScale: {},
        BarElement: {},
        ArcElement: {},
        Title: {},
        Tooltip: {},
        Legend: {},
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  testGlobals.__psOverviewChartMocksRegistered = true;
}

const { DashboardTotalsBarChart } = require("../components/dashboard-totals-bar-chart") as typeof import("../components/dashboard-totals-bar-chart");
const { SharingSummaryBarChart, SharingSummaryPieChart } = require("../components/sharing-summary-graphs") as typeof import("../components/sharing-summary-graphs");

test("directory totals chart maps all four bars to dashboard pages", () => {
  testGlobals.__psChartBarProps = [];
  testGlobals.__psRouterPushCalls = [];

  renderToStaticMarkup(
    React.createElement(DashboardTotalsBarChart, {
      totals: { sites: 1, users: 2, groups: 3, drives: 4 },
    })
  );

  const props = testGlobals.__psChartBarProps.at(-1);
  assert.ok(props);
  assert.deepEqual(props.data.labels, ["SharePoint Sites", "Active Users", "Groups", "Drives"]);

  props.options.onClick({}, [{ index: 0 }]);
  props.options.onClick({}, [{ index: 1 }]);
  props.options.onClick({}, [{ index: 2 }]);
  props.options.onClick({}, [{ index: 3 }]);

  assert.deepEqual(testGlobals.__psRouterPushCalls, [
    "/dashboard/sites",
    "/dashboard/users",
    "/dashboard/groups",
    "/dashboard/activity",
  ]);
});

test("sharing summary bar chart routes clicks when href is configured", () => {
  testGlobals.__psChartBarProps = [];
  testGlobals.__psRouterPushCalls = [];

  renderToStaticMarkup(
    React.createElement(SharingSummaryBarChart, {
      data: [{ label: "Site A", value: 12 }],
      label: "Links",
      xTitle: "Links",
      href: "/dashboard/activity",
    })
  );

  const props = testGlobals.__psChartBarProps.at(-1);
  assert.ok(props);

  props.options.onClick({}, [{ index: 0 }]);

  assert.deepEqual(testGlobals.__psRouterPushCalls, ["/dashboard/activity"]);
});

test("sharing summary bar chart prefers point-specific hrefs", () => {
  testGlobals.__psChartBarProps = [];
  testGlobals.__psRouterPushCalls = [];

  renderToStaticMarkup(
    React.createElement(SharingSummaryBarChart, {
      data: [{ label: "Drive A", value: 12, href: "/sites/drive-123" }],
      label: "Used (GB)",
      xTitle: "GB",
      href: "/dashboard/activity",
    })
  );

  const props = testGlobals.__psChartBarProps.at(-1);
  assert.ok(props);

  props.options.onClick({}, [{ index: 0 }]);

  assert.deepEqual(testGlobals.__psRouterPushCalls, ["/sites/drive-123"]);
});

test("sharing summary pie chart routes clicks when href is configured", () => {
  testGlobals.__psChartPieProps = [];
  testGlobals.__psRouterPushCalls = [];

  renderToStaticMarkup(
    React.createElement(SharingSummaryPieChart, {
      data: [{ label: "anonymous", value: 7 }],
      href: "/dashboard/sharing",
    })
  );

  const props = testGlobals.__psChartPieProps.at(-1);
  assert.ok(props);

  props.options.onClick({}, [{ index: 0 }]);

  assert.deepEqual(testGlobals.__psRouterPushCalls, ["/dashboard/sharing"]);
});

test("sharing summary pie chart prefers point-specific hrefs", () => {
  testGlobals.__psChartPieProps = [];
  testGlobals.__psRouterPushCalls = [];

  renderToStaticMarkup(
    React.createElement(SharingSummaryPieChart, {
      data: [{ label: "User Drives", value: 7, href: "/dashboard/activity?siteType=personal" }],
      href: "/dashboard/activity",
    })
  );

  const props = testGlobals.__psChartPieProps.at(-1);
  assert.ok(props);

  props.options.onClick({}, [{ index: 0 }]);

  assert.deepEqual(testGlobals.__psRouterPushCalls, ["/dashboard/activity?siteType=personal"]);
});
