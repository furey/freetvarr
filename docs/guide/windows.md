---
title: Windows (untested)
description: >-
  A theoretical route to run Freetvarr and TVHeadend on a Windows PC through
  WSL, its limits, and the specs it needs. The author has not tested it.
---

# Windows (untested)

> [!WARNING]<br>
> Everything on this page is untested and theoretical. The author has no Windows PC and has never run Freetvarr on Windows. The steps come from the Microsoft and Docker documentation and from forum reports, not from a working install. Expect to troubleshoot, and expect some parts not to work. The supported route is a NAS or a mini PC that runs Linux (see [The computer](/guide/hardware#the-computer)).

Freetvarr and [TVHeadend](/guide/tvheadend) (the program that runs the tuner and records) are Linux programs in Docker containers. Windows runs Linux containers inside WSL (Windows Subsystem for Linux), which is a small Linux virtual machine. That virtual machine is the source of most of the limits below: by default it has its own network address, and it has no access to a USB tuner or to the graphics chip in the way that Freetvarr uses them.

The most likely route is Docker Engine inside an Ubuntu distribution in WSL, with WSL's mirrored networking turned on (Ubuntu then shares the PC's own network address). Docker Desktop is simpler to install but has more network limits.

## The Windows PC

| Part         | Minimum                                                                          | Recommended                                                   | What it changes                                                                                                              |
| ------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Windows      | Windows 11 version 22H2, 64-bit                                                  | The latest Windows 11                                         | Mirrored networking needs Windows 11 22H2 or later. Without it, the tuner and your phones cannot reach the containers easily |
| Processor    | A 64-bit Intel or AMD processor with `4` cores, with virtualisation turned on    | `6` cores or more                                             | Live TV in the browser converts in software only (see [Live TV conversion](#live-tv-conversion))                             |
| Memory (RAM) | `8GB`                                                                            | `16GB`                                                        | WSL takes up to half of the memory by default, and Windows needs the rest                                                    |
| Storage      | An SSD for Windows and WSL, with room for the recordings: `3–6GB` per hour of HD | A second large drive for recordings (see [Storage](#storage)) | WSL keeps its files in one virtual disk, `1TB` at most by default                                                            |
| Network      | Wired network on the same part of the network as the tuner                       | The same                                                      | Wi-Fi adds dropouts to live TV and recordings                                                                                |
| Power        | A PC that never sleeps                                                           | A small, quiet desktop or mini PC                             | A PC that sleeps, shuts down, or restarts for an update misses the recordings due in that time                               |

Virtualisation is a setting in the PC's BIOS or UEFI firmware, often called Intel VT-x, AMD-V, or SVM. WSL and Docker do not start without it.

Windows 10 has no mirrored networking. On Windows 10 only the [Docker Desktop](#docker-desktop) route applies, with all of its network limits.

## Setup steps

These steps install Docker Engine inside Ubuntu in WSL. Each step links to the source it comes from.

1. In the PC's BIOS or UEFI firmware, turn on virtualisation.
2. In PowerShell (as administrator), run `wsl --install`. This installs WSL and Ubuntu ([Microsoft: Install WSL](https://learn.microsoft.com/en-us/windows/wsl/install)). Restart the PC when it asks, then open Ubuntu from the Start menu and create a Linux username and password.
3. In File Explorer, create the file `.wslconfig` in your user folder (`C:\Users\<your name>`), with this content ([Microsoft: WSL settings](https://learn.microsoft.com/en-us/windows/wsl/wsl-config)):

   ```ini
   [wsl2]
   networkingMode=mirrored

   [general]
   instanceIdleTimeout=-1
   ```

   `networkingMode=mirrored` gives Ubuntu the PC's own network address. `instanceIdleTimeout=-1` stops WSL from shutting Ubuntu down when no window is open.

4. In PowerShell (as administrator), allow devices on your network to connect into WSL ([Microsoft: WSL networking](https://learn.microsoft.com/en-us/windows/wsl/networking#mirrored-mode-networking)):

   ```powershell
   Set-NetFirewallHyperVVMSetting -Name '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}' -DefaultInboundAction Allow
   ```

5. In PowerShell, run `wsl --shutdown`, wait `10` seconds, then open Ubuntu again so the new settings apply.
6. In Ubuntu, check that `/etc/wsl.conf` has these lines, and add them if not (`sudo nano /etc/wsl.conf`). Docker Engine needs systemd to start by itself.

   ```ini
   [boot]
   systemd=true
   ```

7. In Ubuntu, install Docker Engine and the Docker Compose plugin from Docker's own instructions ([Docker: Install Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/)). Then add your user to the `docker` group ([Docker: Linux post-install steps](https://docs.docker.com/engine/install/linux-postinstall/)).
8. In Ubuntu, move to your home folder (`cd ~`) and run the install command from [Getting started](/guide/getting-started#_1-install). Keep the `freetvarr` folder in your Ubuntu home folder, not under `/mnt/c` (see [Storage](#storage)).
9. On a phone or another computer, open `http://<windows-pc-ip>:3733` and run [setup](/guide/getting-started#_2-run-setup). To find the PC's address, run `ipconfig` in PowerShell and read the IPv4 address of the wired adapter.
10. In the **Channels** step of setup, if setup finds no tuner, press **Enter the tuner's address**. Enter the tuner's IP address and the Windows PC's IP address, then press **Use this address**.

The install script stops in Git Bash and other Windows terminals. Run it only in the Ubuntu terminal.

## Limits

### Tuner discovery

TVHeadend finds an HDHomeRun by a network broadcast, so the TVHeadend container needs `network_mode: host` on the same network as the tuner. Microsoft lists multicast support and direct access from the network as features of mirrored networking ([Microsoft: WSL networking](https://learn.microsoft.com/en-us/windows/wsl/networking#mirrored-mode-networking)). Nobody has confirmed that an HDHomeRun broadcast reaches TVHeadend this way. If it does not, enter the tuner's address by hand, as in step 10. The tuner then sends each stream to the PC on UDP port `9983`, which the Windows firewall must also let through.

### Phones and TVs

With mirrored networking and the firewall setting in step 4, a phone or TV on your network opens Freetvarr at the Windows PC's address. Without mirrored networking, WSL has its own private address, and each port needs a Windows port forward (`netsh interface portproxy`) to that address. That address changes when WSL restarts ([Microsoft: WSL networking](https://learn.microsoft.com/en-us/windows/wsl/networking#accessing-a-wsl-2-distribution-from-your-local-area-network-lan)). Freetvarr uses port `3733`, and Plex (if you add it) uses `32400`.

### Live TV conversion

Freetvarr's hardware conversion uses VAAPI (the Linux interface to the graphics chip's video encoder) on `/dev/dri`, the Linux graphics device. WSL shares the graphics chip in another way (through a Direct3D 12 driver), and Freetvarr does not set that up ([Microsoft: GPU video acceleration in WSL](https://devblogs.microsoft.com/commandline/d3d12-gpu-video-acceleration-in-the-windows-subsystem-for-linux-now-available/)). Plan for software conversion only, with the limits in [The computer](/guide/hardware#the-computer): live TV in the browser at `540` lines, and only as many live streams as the processor converts smoothly. Do not use the hardware override file from [Hardware transcoding](/guide/hardware#hardware-transcoding). Recording needs no conversion, so recordings are not affected.

### USB tuners

A USB tuner does not work. The usbipd-win tool connects a USB device to WSL, but the WSL kernel has no DVB drivers (the Linux drivers for TV tuners), so TVHeadend has no tuner to use. A custom WSL kernel is the only way around it ([usbipd-win: WSL support](https://github.com/dorssel/usbipd-win/wiki/WSL-support)), and a TVHeadend forum user reports that a DVB tuner still did not work in WSL with it ([TVHeadend forum](https://tvheadend.org/boards/5/topics/48148)). Use a network tuner.

### Storage

Keep the `freetvarr` folder, and so the recordings, in the Ubuntu file system. Microsoft recommends the Linux file system for Linux programs, because files under `/mnt/c` are slower to reach ([Microsoft: Working across file systems](https://learn.microsoft.com/en-us/windows/wsl/filesystems)). Windows drives also do not keep the Linux file owners that `PUID` and `PGID` (the user and group in Freetvarr's `.env`) set. The Ubuntu file system is one virtual disk file on the C: drive, `1TB` at most by default (`defaultVhdSize` in `.wslconfig`).

To copy a recording to Windows, open `\\wsl$\Ubuntu\home\<linux username>\freetvarr\data` in File Explorer. To back up Freetvarr's settings, stop Freetvarr and copy the whole `freetvarr\config` folder out the same way (see [Backups](/guide/configuration#backups)).

### Always on

TVHeadend records only while the PC is on and Ubuntu is running:

- In Windows **Settings → SYSTEM → Power**, set sleep to **Never**.
- Windows Update restarts the PC. Set **Active hours** in **Settings → Windows Update → Advanced options** to cover the times you record most.
- After a restart, WSL does not start until something starts it. A Task Scheduler task that runs `wsl.exe -d Ubuntu` when you sign in starts Ubuntu, and Docker Engine then starts the containers. Forum reports say a task that runs before sign-in is unreliable, so sign-in after each restart may be necessary.

A desktop PC that stays on uses more power than a NAS or a mini PC.

## Docker Desktop

Docker Desktop is a Windows app that runs Docker in WSL for you. It is free for personal use and for small businesses ([Docker: Docker Desktop licence](https://docs.docker.com/subscription/desktop-license/)). It needs `8GB` of memory, and Docker lists Windows 10 22H2 and Windows 11 23H2 or later ([Docker: Install Docker Desktop on Windows](https://docs.docker.com/desktop/setup/install/windows-install/)). In **Settings → General**, turn on **Start Docker Desktop when you sign in to your computer**.

Its network limits are larger:

- Host networking (Docker Desktop `4.34` or later) does not give the containers the PC's network addresses ([Docker: Host network driver](https://docs.docker.com/engine/network/drivers/host/)), so TVHeadend cannot find the tuner by broadcast. Enter the tuner's address by hand.
- Docker Desktop does not use WSL's mirrored networking ([Docker forum](https://forums.docker.com/t/host-networking-not-working-on-docker-desktop-in-wsl2-with-mirrored-mode/147994/2)).
- Whether the tuner's streams on port `9983` reach TVHeadend, and whether phones reach port `3733`, is untested.

Run the install command in the Ubuntu terminal, with Docker Desktop's WSL integration turned on for Ubuntu, not in PowerShell.

## The supported route

A small NAS or a mini PC that runs Linux avoids every limit on this page: the tuner is found by itself, Quick Sync (the video encoder in Intel processors) converts live TV, and the computer stays on with little power. See [The computer](/guide/hardware#the-computer) for specs and examples, and [Getting started](/guide/getting-started) for the install.
