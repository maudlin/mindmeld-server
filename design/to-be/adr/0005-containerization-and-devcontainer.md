# ADR 0005: Containerization and Devcontainer

Status: Accepted

Context
- We need consistent, reproducible environments for development, testing, and production.
- Options considered: raw Node runtime on host, Docker container(s), docker-compose for local orchestration, and VS Code devcontainers for editor-integrated environments.

Decision
- Provide a single service Docker container for the app to be used in local testing and production deployment.
- Provide a minimal VS Code devcontainer for a uniform dev environment, using the same Node.js version and basic tooling.
- docker-compose is optional; we will add it if/when we introduce dependent services (e.g., external DB or reverse proxy). For the MVP, a single container is sufficient.

Consequences
- Reproducible builds and runtime parity between dev and prod.
- Lower onboarding friction; contributors can use the devcontainer or local Node as they prefer.
- Clear path to add compose later if additional services are introduced.

Implementation Notes
- Dockerfile: multi-stage or single-stage minimal Node 18+ image; copy package*.json, npm ci, copy source, expose PORT (3001), CMD npm start.
- Devcontainer: .devcontainer/devcontainer.json with image or Dockerfile reference, Node version (18), features for git and npm, and workspace mounting.
- Scripts: optional compose file later if dependencies are added.
