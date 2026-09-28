import type { CandidateIssue } from "../types.js";

interface CandidateIssuesProps {
  issues: CandidateIssue[];
}

export function CandidateIssues({ issues }: CandidateIssuesProps) {
  return (
    <section aria-label="Candidate issues">
      <h2>Candidate issues ({issues.length})</h2>
      {issues.length === 0 ? (
        <p className="muted">No open candidates reported by the daemon.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Issue</th>
              <th scope="col">Repo</th>
              <th scope="col">Status</th>
              <th scope="col">Attention</th>
            </tr>
          </thead>
          <tbody>
            {issues.map((issue) => (
              <tr key={`${issue.repo}#${issue.number}`}>
                <td>
                  {issue.url ? (
                    <a href={issue.url} target="_blank" rel="noreferrer">
                      #{issue.number} {issue.title}
                    </a>
                  ) : (
                    <span>
                      #{issue.number} {issue.title}
                    </span>
                  )}
                </td>
                <td className="muted">{issue.repo}</td>
                <td>{issue.status}</td>
                <td className="muted small">{issue.attention}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
