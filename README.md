Ember ZLI
=================

Interact with EmberZNet-based adapters using zigbee-herdsman 'ember' driver

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/ember-zli.svg)](https://npmjs.org/package/ember-zli)
[![Downloads/week](https://img.shields.io/npm/dw/ember-zli.svg)](https://npmjs.org/package/ember-zli)

> [!WARNING] 
> Work in progress

### Interactive Menus

#### Stack

- Get stack info
- Get stack config (firmware defaults)
- Get network info
- Scan network
  - Channels usage / RSSI (11-26)
  - Existing networks
- Backup network
- Restore network
- Leave network
- Backup NVM3 tokens
- Restore NVM3 tokens
- Reset NVM3 tokens
- Get security info
- Repairs
  - Check for EUI64 mismatch

#### Bootloader

- Get info
- Update firmware
- Clear NVM3
- Exit bootloader

#### Router

- Join network
- Rejoin network
- Leave network
- Backup NVM3 tokens
- Restore NVM3 tokens
- Reset NVM3 tokens
- Get network info
- Set manufacturer code
- Read counters
- Ping coordinator
- Reload custom event handlers
- Run custom script

#### Sniff

- Start sniffing

#### Utils

- Parse NVM3 tokens backup file

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
ember-zli/2.1.0 win32-x64 node-v20.15.0
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

Interact with the Gecko bootloader in the adapter via serial.

```
USAGE
  $ ember-zli bootloader [-f <value>] [-r]

FLAGS
  -f, --file=<value>  Path to a firmware file. If not provided, will be set via interactive prompt when entering
                      relevant menu.
  -r, --forceReset    Try to force reset into bootloader.

DESCRIPTION
  Interact with the Gecko bootloader in the adapter via serial.

EXAMPLES
  $ ember-zli bootloader
```

_See code: [src/commands/bootloader/index.ts](https://github.com/Nerivec/ember-zli/blob/v2.1.0/src/commands/bootloader/index.ts)_

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

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v6.2.5/src/commands/help.ts)_

## `ember-zli router`

Use a coordinator firwmare as a router and interact with the joined network.

```
USAGE
  $ ember-zli router

DESCRIPTION
  Use a coordinator firwmare as a router and interact with the joined network.

EXAMPLES
  $ ember-zli router
```

_See code: [src/commands/router/index.ts](https://github.com/Nerivec/ember-zli/blob/v2.1.0/src/commands/router/index.ts)_

## `ember-zli sniff`

Sniff Zigbee traffic (to Wireshark, to custom handler or just log in file)

```
USAGE
  $ ember-zli sniff

DESCRIPTION
  Sniff Zigbee traffic (to Wireshark, to custom handler or just log in file)

EXAMPLES
  $ ember-zli sniff
```

_See code: [src/commands/sniff/index.ts](https://github.com/Nerivec/ember-zli/blob/v2.1.0/src/commands/sniff/index.ts)_

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

_See code: [src/commands/stack/index.ts](https://github.com/Nerivec/ember-zli/blob/v2.1.0/src/commands/stack/index.ts)_

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

_See code: [src/commands/utils/index.ts](https://github.com/Nerivec/ember-zli/blob/v2.1.0/src/commands/utils/index.ts)_

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

_See code: [@oclif/plugin-version](https://github.com/oclif/plugin-version/blob/v2.2.6/src/commands/version.ts)_
<!-- commandsstop -->
