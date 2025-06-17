import { Agent } from "agents";
import puppeteer from "@cloudflare/puppeteer";
import { WorkerEnv } from "../types";

export class WebBrowserAgent extends Agent<WorkerEnv> {
  async getPageTitle(url: string): Promise<string | null> {
    try {
      const browser = await puppeteer.launch(this.env.BROWSER);
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      const title = await page.title();
      await browser.close();
      return title;
    } catch (e) {
      console.error(`Failed to browse to ${url}:`, e);
      return null;
    }
  }
}