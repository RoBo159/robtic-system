# Local dev tool only — not part of the deployed stack and not built by infra/docker/scripts/build.sh
# or any deploy workflow. infra/ansible/scripts/vault.sh builds and runs this on demand when a native
# `ansible-vault` isn't usable (e.g. ansible-core's blocking-io check fails under Git Bash/mintty on
# Windows: "OSError: [WinError 1] Incorrect function"). Running ansible-vault inside a real Linux
# container sidesteps that entirely, on any host OS.
FROM python:3.12-slim

RUN pip install --no-cache-dir "ansible-core>=2.15,<2.19"

WORKDIR /work

ENTRYPOINT ["ansible-vault"]
