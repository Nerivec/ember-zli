Ember ZLI
=================

Interact with EmberZNet-based adapters using zigbee-herdsman 'ember' driver

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/ember-zli.svg)](https://npmjs.org/package/ember-zli)
[![Downloads/week](https://img.shields.io/npm/dw/ember-zli.svg)](https://npmjs.org/package/ember-zli)

> [!IMPORTANT]
> `ember-zli` uses the `ember` driver from [zigbee-herdsman](https://github.com/Koenkk/zigbee-herdsman) under the hood. As such, it roughly has the same firmware requirements as [Zigbee2MQTT ember](https://www.zigbee2mqtt.io/guide/adapters/emberznet.html); firmware 7.4.x minimum.

### Interactive Menus (with links to Wiki)

#### Bootloader

- [Get info](https://github.com/Nerivec/ember-zli/wiki/Bootloader#get-info)
- [Update firmware](https://github.com/Nerivec/ember-zli/wiki/Bootloader#update-firmware)
- [Clear NVM3](https://github.com/Nerivec/ember-zli/wiki/Bootloader#clear-nvm3)
- [Exit bootloader](https://github.com/Nerivec/ember-zli/wiki/Bootloader#exit-bootloader)

#### Router

- [Join network](https://github.com/Nerivec/ember-zli/wiki/Router#join-network)
- [Rejoin network](https://github.com/Nerivec/ember-zli/wiki/Router#rejoin-network)
- [Leave network](https://github.com/Nerivec/ember-zli/wiki/Router#leave-network)
- [Backup NVM3 tokens](https://github.com/Nerivec/ember-zli/wiki/Router#backup-nvm3-tokens)
- [Restore NVM3 tokens](https://github.com/Nerivec/ember-zli/wiki/Router#restore-nvm3-tokens)
- [Reset NVM3 tokens](https://github.com/Nerivec/ember-zli/wiki/Router#reset-nvm3-tokens)
- [Get network info](https://github.com/Nerivec/ember-zli/wiki/Router#get-network-info)
- [Set manufacturer code](https://github.com/Nerivec/ember-zli/wiki/Router#set-manufacturer-code)
- [Read counters](https://github.com/Nerivec/ember-zli/wiki/Router#read-counters)
- [Ping coordinator](https://github.com/Nerivec/ember-zli/wiki/Router#ping-coordinator)
- [Reload custom event handlers](https://github.com/Nerivec/ember-zli/wiki/Router#reload-custom-event-handlers)
- [Run custom script](https://github.com/Nerivec/ember-zli/wiki/Router#run-custom-script)

#### Sniff

- [Start sniffing](https://github.com/Nerivec/ember-zli/wiki/Sniff#start-sniffing)

#### Stack

- [Get stack info](https://github.com/Nerivec/ember-zli/wiki/Stack#get-stack-info)
- [Get stack config (firmware defaults)](https://github.com/Nerivec/ember-zli/wiki/Stack#get-stack-config-firmware-defaults)
- [Get network info](https://github.com/Nerivec/ember-zli/wiki/Stack#get-network-info)
- [Scan network](https://github.com/Nerivec/ember-zli/wiki/Stack#scan-network)
  - [Channels usage / RSSI (11-26)](https://github.com/Nerivec/ember-zli/wiki/Stack#channels-usage--rssi-11-26)
  - [Existing networks](https://github.com/Nerivec/ember-zli/wiki/Stack#existing-networks)
- [Backup network](https://github.com/Nerivec/ember-zli/wiki/Stack#backup-network)
- [Restore network](https://github.com/Nerivec/ember-zli/wiki/Stack#restore-network)
- [Leave network](https://github.com/Nerivec/ember-zli/wiki/Stack#leave-network)
- [Backup NVM3 tokens](https://github.com/Nerivec/ember-zli/wiki/Stack#backup-nvm3-tokens)
- [Restore NVM3 tokens](https://github.com/Nerivec/ember-zli/wiki/Stack#restore-nvm3-tokens)
- [Reset NVM3 tokens](https://github.com/Nerivec/ember-zli/wiki/Stack#reset-nvm3-tokens)
- [Get security info](https://github.com/Nerivec/ember-zli/wiki/Stack#get-security-info)
- [Repairs](https://github.com/Nerivec/ember-zli/wiki/Stack#repairs)
  - [Check for EUI64 mismatch](https://github.com/Nerivec/ember-zli/wiki/Stack#check-for-eui64-mismatch)

#### Utils

- [Parse NVM3 tokens backup file](https://github.com/Nerivec/ember-zli/wiki/Utils#parse-nvm3-tokens-backup-file)

# ToC

<!-- toc -->
* [ToC](#toc)
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g ember-zli
$ ember-zli COMMAND
running command...
$ ember-zli (--version)
ember-zli/2.5.0 win32-x64 node-v20.15.0
$ ember-zli --help [COMMAND]
USAGE
  $ ember-zli COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`ember-zli bootloader`](#ember-zli-bootloader)
* [`ember-zli help [COMMAND]`](#ember-zli-help-command)
* [`ember-zli router`](#ember-zli-router)
* [`ember-zli sniff`](#ember-zli-sniff)
* [`ember-zli stack`](#ember-zli-stack)
* [`ember-zli utils`](#ember-zli-utils)
* [`ember-zli version`](#ember-zli-version)

## `ember-zli bootloader`

Interact with the Gecko bootloader in the adapter.

```
USAGE
  $ ember-zli bootloader

DESCRIPTION
  Interact with the Gecko bootloader in the adapter.

EXAMPLES
  $ ember-zli bootloader
```

_See code: [src/commands/bootloader/index.ts](https://github.com/Nerivec/ember-zli/blob/v2.5.0/src/commands/bootloader/index.ts)_

## `ember-zli help [COMMAND]`

Display help for ember-zli.

```
USAGE
  $ ember-zli help [COMMAND...] [-n]

ARGUMENTS
  COMMAND...  Command to show help for.

FLAGS
  -n, --nested-commands  Include all nested commands in the output.

DESCRIPTION
  Display help for ember-zli.
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v6.2.13/src/commands/help.ts)_

## `ember-zli router`

Use a coordinator firmware as a router and interact with the joined network.

```
USAGE
  $ ember-zli router

DESCRIPTION
  Use a coordinator firmware as a router and interact with the joined network.

EXAMPLES
  $ ember-zli router
```

_See code: [src/commands/router/index.ts](https://github.com/Nerivec/ember-zli/blob/v2.5.0/src/commands/router/index.ts)_

## `ember-zli sniff`

Sniff Zigbee traffic (to Wireshark, to PCAP file, to custom handler or just log raw data).

```
USAGE
  $ ember-zli sniff

DESCRIPTION
  Sniff Zigbee traffic (to Wireshark, to PCAP file, to custom handler or just log raw data).

EXAMPLES
  $ ember-zli sniff
```

_See code: [src/commands/sniff/index.ts](https://github.com/Nerivec/ember-zli/blob/v2.5.0/src/commands/sniff/index.ts)_

## `ember-zli stack`

Interact with the EmberZNet stack in the adapter.

```
USAGE
  $ ember-zli stack

DESCRIPTION
  Interact with the EmberZNet stack in the adapter.

EXAMPLES
  $ ember-zli stack
```

_See code: [src/commands/stack/index.ts](https://github.com/Nerivec/ember-zli/blob/v2.5.0/src/commands/stack/index.ts)_

## `ember-zli utils`

Execute various utility commands.

```
USAGE
  $ ember-zli utils

DESCRIPTION
  Execute various utility commands.

EXAMPLES
  $ ember-zli utils
```

_See code: [src/commands/utils/index.ts](https://github.com/Nerivec/ember-zli/blob/v2.5.0/src/commands/utils/index.ts)_

## `ember-zli version`

```
USAGE
  $ ember-zli version [--json] [--verbose]

FLAGS
  --verbose  Show additional information about the CLI.

GLOBAL FLAGS
  --json  Format output as json.

FLAG DESCRIPTIONS
  --verbose  Show additional information about the CLI.

    Additionally shows the architecture, node version, operating system, and versions of plugins that the CLI is using.
```

_See code: [@oclif/plugin-version](https://github.com/oclif/plugin-version/blob/v2.2.14/src/commands/version.ts)_
<!-- commandsstop -->
