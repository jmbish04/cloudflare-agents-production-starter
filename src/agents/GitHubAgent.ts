import { Agent } from "agents";
import { WorkerEnv, GitHubRepoDTO } from "../types";

export class GitHubAgent extends Agent<WorkerEnv> {
  async getRepo(repoName: string): Promise<GitHubRepoDTO | null> {
    try {
      const res = await fetch(`https://api.github.com/repos/${repoName}`, {
        headers: {
          "Authorization": `Bearer ${this.env.GITHUB_API_TOKEN}`,
          "User-Agent": "Cloudflare-Agent-v1"
        }
      });
      if (!res.ok) {
        console.error(`GitHub API Error: ${res.status}`);
        return null;
      }
      const data = await res.json() as any;
      return {
        name: data.name,
        full_name: data.full_name,
        description: data.description,
        stargazers_count: data.stargazers_count,
        open_issues_count: data.open_issues_count,
        url: data.html_url
      };
    } catch (e) {
      console.error("Failed to fetch from GitHub API:", e);
      return null;
    }
  }
}