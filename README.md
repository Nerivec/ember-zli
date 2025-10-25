Ember ZLI
=================

Interact with EmberZNet-based adapters using zigbee-herdsman 'ember' driver. Also supports bootloading to/from CPC and Spinel protocols.

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/ember-zli.svg)](https://npmjs.org/package/ember-zli)
[![Downloads](https://img.shields.io/npm/dt/ember-zli.svg)](https://npmjs.org/package/ember-zli)
[![ci](https://github.com/Nerivec/ember-zli/actions/workflows/ci.yml/badge.svg)](https://github.com/Nerivec/ember-zli/actions/workflows/ci.yml)

> [!IMPORTANT]
> `ember-zli` uses the `ember` driver from [zigbee-herdsman](https://github.com/Koenkk/zigbee-herdsman) under the hood. As such, it roughly has the same firmware requirements as [Zigbee2MQTT ember](https://www.zigbee2mqtt.io/guide/adapters/emberznet.html); firmware 7.4.x minimum.

### Available Interactive Menus

See https://github.com/Nerivec/ember-zli/wiki

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
ember-zli/3.2.0 linux-x64 node-v24.9.0
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
* [`ember-zli monitor`](#ember-zli-monitor)
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

_See code: [src/commands/bootloader/index.ts](https://github.com/Nerivec/ember-zli/blob/v3.2.0/src/commands/bootloader/index.ts)_

## `ember-zli help [COMMAND]`

Display help for ember-zli.

```
USAGE
  $ ember-zli help [COMMAND...] [-n]

ARGUMENTS
  [COMMAND...]  Command to show help for.

FLAGS
  -n, --nested-commands  Include all nested commands in the output.

DESCRIPTION
  Display help for ember-zli.
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v6.2.34/src/commands/help.ts)_

## `ember-zli monitor`

Monitor the chosen port in the console.

```
USAGE
  $ ember-zli monitor

DESCRIPTION
  Monitor the chosen port in the console.

EXAMPLES
  $ ember-zli monitor
```

_See code: [src/commands/monitor/index.ts](https://github.com/Nerivec/ember-zli/blob/v3.2.0/src/commands/monitor/index.ts)_

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

_See code: [src/commands/router/index.ts](https://github.com/Nerivec/ember-zli/blob/v3.2.0/src/commands/router/index.ts)_

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

_See code: [src/commands/sniff/index.ts](https://github.com/Nerivec/ember-zli/blob/v3.2.0/src/commands/sniff/index.ts)_

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

_See code: [src/commands/stack/index.ts](https://github.com/Nerivec/ember-zli/blob/v3.2.0/src/commands/stack/index.ts)_

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

_See code: [src/commands/utils/index.ts](https://github.com/Nerivec/ember-zli/blob/v3.2.0/src/commands/utils/index.ts)_

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

_See code: [@oclif/plugin-version](https://github.com/oclif/plugin-version/blob/v2.2.35/src/commands/version.ts)_
<!-- commandsstop -->
