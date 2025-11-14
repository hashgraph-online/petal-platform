import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import axios from "axios";

import {
  __resetMirrorPerformanceForTests,
  fetchTopicMessages,
  getMirrorPerformance,
  getMirrorSuggestedRefreshInterval,
  lookupAccount,
} from "@/lib/hedera/mirror";

vi.mock("axios");

describe("mirror performance tracking", () => {
  let nowSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetMirrorPerformanceForTests();
    nowSpy = vi.spyOn(Date, "now");
  });

  afterEach(() => {
    nowSpy.mockRestore();
    vi.resetAllMocks();
  });

  it("records successful request durations and updates refresh interval", async () => {
    const sequence = [0, 25];
    let index = 0;
    nowSpy.mockImplementation(() => {
      const value = sequence[index] ?? sequence[sequence.length - 1];
      index += 1;
      return value;
    });

    const mockedAxiosGet = axios.get as unknown as Mock;
    mockedAxiosGet.mockResolvedValue({
      data: { messages: [] },
      status: 200,
    });

    await fetchTopicMessages("0.0.100");

    const stats = getMirrorPerformance();
    expect(stats.samples).toBe(1);
    expect(stats.lastRequestMs).toBe(25);
    expect(stats.averageRequestMs).toBe(25);
    expect(getMirrorSuggestedRefreshInterval()).toBeGreaterThanOrEqual(15000);
  });

  it("tracks retries and retains last error status", async () => {
    const sequence = [0, 1000, 2000, 3000];
    let index = 0;
    nowSpy.mockImplementation(() => {
      const value = sequence[index] ?? sequence[sequence.length - 1];
      index += 1;
      return value;
    });

    const mockedAxiosGet = axios.get as unknown as Mock;
    mockedAxiosGet
      .mockRejectedValueOnce({ response: { status: 503 } })
      .mockResolvedValueOnce({ data: { account: "0.0.2" }, status: 200 });

    await lookupAccount("0.0.2");

    const stats = getMirrorPerformance();
    expect(stats.samples).toBe(2);
    expect(stats.lastErrorStatus).toBeNull();
    expect(stats.lastRequestMs).toBe(1000);
    expect(stats.averageRequestMs).toBe(1000);
    const interval = getMirrorSuggestedRefreshInterval();
    expect(interval).toBeGreaterThanOrEqual(15000);
    expect(interval).toBeLessThanOrEqual(60000);
  });
});
