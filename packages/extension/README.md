# Bookshelf

Language support for `.bs`, the language describing what a [Bookshelf](https://github.com/mcbookshelf) module offers:
its features, what each one runs as, takes and returns, and who wrote it.

## Features

- syntax highlighting, folding and indentation
- completion of the lines and kinds a registry takes, of types, and of the `$` names which fit where they are written
- validation of `$` definitions, of lists and the features repeated over them, of what a registry accepts,
  of what a feature inherits, of types, structs and ranges
- hover on lines, fields, `$` definitions and features, and on a `$list` inside a doc or an id

## Example

```bs
> Read and modify player XP levels.

name XP
slug bookshelf-xp
version 5.0.0
tags runtime
authors Aksiome, Leirof
since 2022/04/14 1.18.2

$updated: output state > the experience bar is updated

feature function add_levels > Add levels to players.
  @executor: player[] > players to add levels to
  input arguments:
    levels: int > levels to add, negative to remove
  $updated

feature function get_progress > Get the fill progress of the experience bar.
  @executor: player > player to get the bar progress from
  output storage: float @ 0..1 > fraction of the bar filled
```
