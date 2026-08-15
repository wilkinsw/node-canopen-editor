# canopen(1) -- command-line editor for CANopen EDS/XDD device descriptions

## SYNOPSIS

`canopen` <command> [<subcommand>] [<args>] [<options>]

## DESCRIPTION

**canopen** creates, inspects, edits, converts, and exports CANopen device
description files. It supports the same feature set as the graphical
node-canopen-editor apps and shares their file model, so files can move
freely between the CLI and the GUI.

Supported formats:

* **EDS** (`.eds`) -- CiA 306 INI-style electronic data sheet
* **XDD** (`.xdd`) -- CiA 311 XML device description
* **CANopenNode C** -- `OD.h` / `OD.c` export for the CANopenNode v4 stack

The file format is detected from the extension. `-` in a file position reads
stdin or writes stdout and requires `-F`/`--format eds|xdd`.

**Editing model.** Every mutating command follows read-modify-write: the file
is parsed, the edit applied, and the result written back **in place** by
default. Pass `-o`/`--output <file|->` to write elsewhere; the output
extension controls the output format, so `-o` doubles as a converter. Output
is deterministic -- modification date/time are never stamped unless `--touch
[name]` is given (with the optional value also setting `modifiedBy`).

**Machine-readable output.** Every read command accepts `--json` and then
prints pure JSON on stdout. Mutating commands with `--json` print
`{"ok": true, "file": ..., "changed": [...]}`. Indices are printed as
uppercase hex (`0x2000`, sub-indices `0x01`).

## COMMON ARGUMENTS

* <file>:
  Path to an `.eds` or `.xdd` file, or `-` for stdin/stdout (needs `--format`).
* <index>:
  Object index, hex (`0x2000`) or decimal. Valid range 0x0000 - 0xFFFF.
* <ref>:
  Object reference `index[.sub]`, e.g. `0x2000.3` (sub-index hex or decimal).
* <dir>:
  PDO direction, `tx` or `rx`.
* <n>:
  PDO id as shown by `canopen pdo list` (the communication index, e.g.
  `0x1800`, is also accepted).

## FILE COMMANDS

* `canopen new <file> [--product-name <s>] [--force]`:
  Create a new, empty device description (three mandatory communication
  objects included).
* `canopen info <file>`:
  Summarize a file: format, product, object counts per category, PDO counts.
* `canopen convert <input> <output> [--from eds|xdd] [--to eds|xdd]`:
  Convert between EDS and XDD.
* `canopen export-c <file> [-o <dir>] [--name OD]`:
  Export CANopenNode C source. Writes `<name>.h` and `<name>.c` into the
  output directory (default `.`).
* `canopen validate <file> [--strict]`:
  Consistency checks (see **VALIDATION** below). Exits 3 when errors are
  found; `--strict` promotes warnings to errors.
* `canopen docs`:
  Print this manual to stdout.

## DEVICE METADATA

* `canopen device show <file>`:
  All metadata fields plus comments.
* `canopen device get <file> <key>`:
  Print one value.
* `canopen device set <file> <key>=<value>...`:
  Set one or more values in a single invocation.
* `canopen device comment list|add|rm|clear <file> ...`:
  Manage the free-form `[Comments]` lines. `rm` takes the 1-based line
  number shown by `list`.

Keys are dotted paths:

* `fileInfo.` -- `fileName`, `fileVersion`, `fileRevision`, `edsVersion`,
  `description`, `creationTime`, `creationDate`, `createdBy`,
  `modificationTime`, `modificationDate`, `modifiedBy` (strings; dates are
  EDS-style `MM-DD-YYYY`, times `h:mmAM`).
* `deviceInfo.` -- `vendorName`, `vendorNumber`, `productName`,
  `productNumber`, `revisionNumber`, `orderCode` (strings), `granularity`,
  `dynamicChannelsSupported` (numbers).
* `baud.` -- `10`, `20`, `50`, `125`, `250`, `500`, `800`, `1000`
  (booleans: `true`/`false`, `yes`/`no`, `on`/`off`, `1`/`0`).
* `feature.` -- `simpleBootUpMaster`, `simpleBootUpSlave`, `groupMessaging`,
  `lssSupported` (booleans).

## OBJECT DICTIONARY

* `canopen object list <file> [--category <key>] [--long]`:
  List entries grouped by category (`communication`, `manufacturer`,
  `device-profile`, `other`). `--long` adds defaults, limits, PDO flag,
  and storage location.
* `canopen object show <file> <index>`:
  Every field of one entry, plus a sub-object table for ARRAY/RECORD.
* `canopen object add <file> <index> --type var|array|record [fields]`:
  Add an entry. Containers are created with their structural sub 0.
* `canopen object set <file> <index> [fields] [--object-type <t>]`:
  Edit fields of an existing entry.
* `canopen object rm <file> <index>...`:
  Remove one or more entries.
* `canopen object copy <file> <index> [-o <json-file>]`:
  Emit the entry as clipboard-envelope JSON (stdout by default).
* `canopen object paste <file> [--index <idx>] [--from <json-file>] [--force]`:
  Insert an entry from envelope JSON (stdin by default). Defaults to the
  payload's original index; refuses to overwrite without `--force`.

Field options for `add`/`set` (all optional):

* `--name <s>` -- parameter name
* `--data-type <t>` -- CiA-301 data type by name (`UNSIGNED16`,
  `VISIBLE_STRING`, ...) or numeric code
* `--access <a>` -- `rw`, `ro`, `wo`, `const`, `rww`, `rwr`
* `--default <s>`, `--low <s>`, `--high <s>` -- raw value strings
* `--string-length <n>` -- string data types only
* `--pdo-mapping` / `--no-pdo-mapping` -- gate PDO mappability
* `--storage <s>` -- storage location (top-level objects only; empty clears)

## SUB-OBJECTS

Sub-object 0 of an ARRAY/RECORD is structural ("highest sub-index
supported"): it cannot be removed, and `sub add`/`sub rm` keep its value
current automatically -- identical to the GUI's behavior.

* `canopen sub add <file> <index> [fields]`:
  Append a sub-object at the next free sub-index.
* `canopen sub set <file> <ref> [fields]`:
  Edit a sub-object, e.g. `canopen sub set dev.eds 0x2000.1 --default 100`.
* `canopen sub rm <file> <ref>`:
  Remove a sub-object (sub 0 refused).
* `canopen sub copy <file> <ref> [-o <json-file>]`:
  Emit envelope JSON for one sub-object.
* `canopen sub paste <file> <index> [--from <json-file>]`:
  Append a sub-object from envelope JSON. Always appends at the next free
  sub-index (the payload's original sub-index is ignored, like the GUI).

## PDOS

PDOs live in the standard index ranges (RX: comm `0x1400`+, mapping
`0x1600`+; TX: comm `0x1800`+, mapping `0x1A00`+) and are limited to
**8 mappings / 64 bits** each. Where the GUI silently rejects an
over-capacity drop, the CLI fails loudly with a nonzero exit.

* `canopen pdo list <file> [--tx|--rx]`:
  All PDOs with COB-ID, transmission type, bit usage, and mapping summary.
* `canopen pdo show <file> <dir> <n>`:
  One PDO in full: comm parameters, slot table, and an ASCII 64-bit map.
* `canopen pdo add <file> <dir>`:
  Add a PDO at the next free comm index.
* `canopen pdo rm <file> <dir> <n>`:
  Remove a PDO (both its comm and mapping objects).
* `canopen pdo set <file> <dir> <n> [params]`:
  Set comm parameters: `--cob-id <id>` (masked to 11 bits, warning on
  overflow), `--transmission-type <0-255>`, `--inhibit-time <n>`,
  `--event-timer <n>`, `--sync-start <n>`, `--disabled`/`--enabled`.
* `canopen pdo map <file> <dir> <n> <ref>... [--at <slot>]`:
  Map objects into a PDO. Targets must exist, have `pdoMapping=true`, and a
  fixed-size data type.
* `canopen pdo unmap <file> <dir> <n> <slot-or-ref>`:
  Remove a mapping by 1-based slot number (plain decimal) or by 0x-prefixed
  object reference.
* `canopen pdo reorder <file> <dir> <n> <from> <to>`:
  Move a mapping between 1-based slots.

## VALIDATION

`canopen validate` reports **errors**: out-of-range indices/sub-indices,
containers missing sub-objects or sub 0, stale sub 0 highest-sub-index
values, `subNumber` mismatches, VAR entries without a data type, invalid
access types, unpaired PDO comm/mapping objects, mappings that reference
nonexistent objects or disagree with the target's bit size, PDOs over 8
slots / 64 bits, out-of-range transmission types and COB-IDs.

And **warnings** (errors with `--strict`): mapped targets with
`pdoMapping=false`, stale `nrOfRXPDO`/`nrOfTXPDO` counts, missing mandatory
objects `0x1000`/`0x1001`/`0x1018`, non-numeric or inconsistent
defaults/limits on numeric types.

## EXIT STATUS

* `0` -- success (including validate with warnings only)
* `1` -- domain or runtime error (bad index, parse failure, PDO capacity...)
* `2` -- usage error (unknown command or flags)
* `3` -- validate found errors

## MODEL NOTES

This section documents the data structures for scripting and AI agents.

The parsed model (what `--json` output is derived from) is:

    {
      "fileInfo":   { "fileName": "", "fileVersion": "", ... },
      "deviceInfo": { "vendorName": "", "baudRate500": false, ... },
      "comments":   ["line 1", ...],
      "objects": {
        "8192": {                      // keys are DECIMAL indices (0x2000)
          "parameterName": "Motor Params",
          "objectType": 9,             // 2=DOMAIN 5=DEFTYPE 6=DEFSTRUCT
                                       // 7=VAR 8=ARRAY 9=RECORD
          "dataType": 6,               // CiA-301 code, e.g. 6=UNSIGNED16
          "accessType": "rw",          // rw|ro|wo|const|rww|rwr
          "defaultValue": "0x100",     // always strings
          "lowLimit": "0", "highLimit": "5000",
          "pdoMapping": true,
          "storageLocation": "ROM",    // absent means RAM
          "subObjects": {              // ARRAY/RECORD only; key 0 holds the
            "0": { ... },              // highest sub-index as defaultValue
            "1": { ... }
          }
        }
      }
    }

`object copy` / `sub copy` emit the same clipboard envelope the GUI apps put
on the OS clipboard, so JSON can be moved between CLI and GUI:

    { "app": "canopen-editor", "version": 1,
      "kind": "object",    "index": 8192,  "entry": { ... } }
    { "app": "canopen-editor", "version": 1,
      "kind": "subObject", "subIndex": 1,  "sub":   { ... } }

## EXAMPLES

Create a device and build up an object dictionary:

    canopen new motor.eds --product-name "Motor Drive"
    canopen device set motor.eds deviceInfo.vendorName=Acme baud.500=true
    canopen object add motor.eds 0x2000 --type record --name "Motor Params"
    canopen sub add motor.eds 0x2000 --name Speed --data-type INTEGER16 \
        --access rw --pdo-mapping

Wire a TPDO and export C source:

    canopen pdo add motor.eds tx
    canopen pdo map motor.eds tx 1 0x2000.1
    canopen pdo set motor.eds tx 1 --cob-id 0x181 --event-timer 1000
    canopen export-c motor.eds -o ./generated

Convert, inspect, and validate in a pipeline:

    canopen convert motor.eds motor.xdd
    canopen object list motor.xdd --category manufacturer --json
    canopen validate motor.xdd --strict

Transplant an object between files:

    canopen object copy motor.eds 0x2000 | canopen object paste pump.eds

## SEE ALSO

The node-canopen-editor GUI (web and desktop) at
<https://github.com/DaxBot/node-canopen-editor>, and the CiA 301 / CiA 306 /
CiA 311 specifications.
