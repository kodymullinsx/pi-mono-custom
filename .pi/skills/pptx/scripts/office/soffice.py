"""Helpers for running LibreOffice in headless, sandboxed environments."""

from __future__ import annotations

import contextlib
import os
import shutil
import socket
import subprocess
import tempfile
from pathlib import Path
from typing import Iterator




def resolve_soffice_binary() -> str:
    configured = os.environ.get("SOFFICE_BIN")
    if configured:
        return configured
    for candidate in ("soffice", "libreoffice"):
        resolved = shutil.which(candidate)
        if resolved:
            return resolved
    return "soffice"

def get_soffice_env() -> dict[str, str]:
    env = os.environ.copy()
    env.setdefault("SAL_USE_VCLPLUGIN", "svp")
    env.setdefault("SAL_DISABLE_SYNCHRONOUS_PRINTER_DETECTION", "1")
    if _needs_shim():
        shim = _ensure_shim()
        existing = env.get("LD_PRELOAD", "")
        env["LD_PRELOAD"] = f"{shim}:{existing}" if existing else str(shim)
    return env


@contextlib.contextmanager
def temporary_profile() -> Iterator[Path]:
    with tempfile.TemporaryDirectory(prefix="lo-profile-") as td:
        yield Path(td)


def profile_args(profile_dir: str | Path | None) -> list[str]:
    if not profile_dir:
        return []
    return [f"-env:UserInstallation={Path(profile_dir).resolve().as_uri()}"]


def initialize_profile(profile_dir: str | Path, timeout: int = 20) -> subprocess.CompletedProcess:
    Path(profile_dir).mkdir(parents=True, exist_ok=True)
    return run_soffice(
        ["--headless", "--terminate_after_init"],
        profile_dir=profile_dir,
        timeout=timeout,
        capture_output=True,
        text=True,
        check=False,
    )


def run_soffice(
    args: list[str],
    *,
    profile_dir: str | Path | None = None,
    timeout: int | None = None,
    check: bool = False,
    **kwargs,
) -> subprocess.CompletedProcess:
    cmd = [resolve_soffice_binary(), *profile_args(profile_dir), *args]
    return subprocess.run(cmd, env=get_soffice_env(), timeout=timeout, check=check, **kwargs)


_SHIM_SO = Path(tempfile.gettempdir()) / "lo_socket_shim.so"


def _needs_shim() -> bool:
    try:
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        s.close()
        return False
    except OSError:
        return True


def _ensure_shim() -> Path:
    if _SHIM_SO.exists():
        return _SHIM_SO
    src = Path(tempfile.gettempdir()) / "lo_socket_shim.c"
    src.write_text(_SHIM_SOURCE)
    subprocess.run(["gcc", "-shared", "-fPIC", "-o", str(_SHIM_SO), str(src), "-ldl"], check=True, capture_output=True)
    src.unlink(missing_ok=True)
    return _SHIM_SO


_SHIM_SOURCE = r"""
#define _GNU_SOURCE
#include <dlfcn.h>
#include <errno.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/socket.h>
#include <unistd.h>

static int (*real_socket)(int, int, int);
static int (*real_socketpair)(int, int, int, int[2]);
static int (*real_listen)(int, int);
static int (*real_accept)(int, struct sockaddr *, socklen_t *);
static int (*real_close)(int);
static int (*real_read)(int, void *, size_t);

static int is_shimmed[1024];
static int peer_of[1024];
static int wake_r[1024];
static int wake_w[1024];

__attribute__((constructor))
static void init(void) {
    real_socket     = dlsym(RTLD_NEXT, "socket");
    real_socketpair = dlsym(RTLD_NEXT, "socketpair");
    real_listen     = dlsym(RTLD_NEXT, "listen");
    real_accept     = dlsym(RTLD_NEXT, "accept");
    real_close      = dlsym(RTLD_NEXT, "close");
    real_read       = dlsym(RTLD_NEXT, "read");
    for (int i = 0; i < 1024; i++) {
        peer_of[i] = -1;
        wake_r[i]  = -1;
        wake_w[i]  = -1;
    }
}

int socket(int domain, int type, int protocol) {
    if (domain == AF_UNIX) {
        int fd = real_socket(domain, type, protocol);
        if (fd >= 0) return fd;
        int sv[2];
        if (real_socketpair(domain, type, protocol, sv) == 0) {
            if (sv[0] >= 0 && sv[0] < 1024) {
                is_shimmed[sv[0]] = 1;
                peer_of[sv[0]]    = sv[1];
                int wp[2];
                if (pipe(wp) == 0) {
                    wake_r[sv[0]] = wp[0];
                    wake_w[sv[0]] = wp[1];
                }
            }
            return sv[0];
        }
        errno = EPERM;
        return -1;
    }
    return real_socket(domain, type, protocol);
}

int listen(int sockfd, int backlog) {
    if (sockfd >= 0 && sockfd < 1024 && is_shimmed[sockfd]) {
        return 0;
    }
    return real_listen(sockfd, backlog);
}

int accept(int sockfd, struct sockaddr *addr, socklen_t *addrlen) {
    if (sockfd >= 0 && sockfd < 1024 && is_shimmed[sockfd]) {
        char dummy;
        if (wake_r[sockfd] >= 0) real_read(wake_r[sockfd], &dummy, 1);
        int cfd = peer_of[sockfd];
        peer_of[sockfd] = -1;
        if (addrlen) *addrlen = 0;
        return cfd;
    }
    return real_accept(sockfd, addr, addrlen);
}

int close(int fd) {
    if (fd >= 0 && fd < 1024 && is_shimmed[fd]) {
        if (wake_w[fd] >= 0) {
            write(wake_w[fd], "x", 1);
            real_close(wake_w[fd]);
            wake_w[fd] = -1;
        }
        if (wake_r[fd] >= 0) {
            real_close(wake_r[fd]);
            wake_r[fd] = -1;
        }
        is_shimmed[fd] = 0;
    }
    return real_close(fd);
}
"""
