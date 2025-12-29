# NEW_TOOL_SCHEMA_v3.md - Complete Outline

## Document Structure

```
# Flux & Scout — MCP Tools Schema (V3)

## Overview
- Summary table (tools, actions, operations count)
- Math breakdown

## Quick Reference
### Flux Tool — All Subactions by Action
### Scout Tool — All Actions with Subactions

## File Structure Recommendation

---

# Tool 1: `flux`

## Help Action
- Description
- Examples
- Implementation notes

## `container` Action (14 subactions)

### `list`
#### Parameters
#### Examples

### `start`
#### Parameters
#### Examples

### `stop`
#### Parameters
#### Examples

### `restart`
#### Parameters
#### Examples

### `pause`
#### Parameters
#### Examples

### `resume` (was unpause)
#### Parameters
#### Examples

### `logs`
#### Parameters
#### Examples

### `stats`
#### Parameters
#### Examples

### `inspect`
#### Parameters
#### Examples

### `search`
#### Parameters
#### Examples

### `pull`
#### Parameters
#### Examples

### `recreate`
#### Parameters
#### Examples

### `exec`
#### Parameters
#### Examples

### `top`
#### Parameters
#### Examples

---

## `compose` Action (9 subactions)

### `list`
#### Parameters
#### Examples

### `status`
#### Parameters
#### Examples

### `up`
#### Parameters
#### Examples

### `down`
#### Parameters
#### Examples

### `restart`
#### Parameters
#### Examples

### `logs`
#### Parameters
#### Examples

### `build`
#### Parameters
#### Examples

### `pull`
#### Parameters
#### Examples

### `recreate`
#### Parameters
#### Examples

---

## `docker` Action (9 subactions)

### `info`
#### Parameters
#### Examples

### `df`
#### Parameters
#### Examples

### `prune`
#### Parameters
#### Examples

### `images`
#### Parameters
#### Examples

### `pull`
#### Parameters
#### Examples

### `build`
#### Parameters
#### Examples

### `rmi`
#### Parameters
#### Examples

### `networks`
#### Parameters
#### Examples

### `volumes`
#### Parameters
#### Examples

---

## `host` Action (7 subactions)

### `status`
#### Parameters
#### Examples

### `resources`
#### Parameters
#### Examples

### `info`
#### Parameters
#### Examples

### `uptime`
#### Parameters
#### Examples

### `services`
#### Parameters
#### Examples

### `network`
#### Parameters
#### Examples

### `mounts`
#### Parameters
#### Examples

---

## Flux Common Parameters
- response_format
- Pagination (limit, offset)

## Flux Discriminator Keys
- Complete list of all 39 keys

## Flux Schemas
### Discriminated Union Pattern
### Validation
### Preprocessor Implementation
### Example Schemas (container, compose, docker, host)

---

# Tool 2: `scout`

## Help Action
- Description
- Examples
- Implementation notes

## `nodes` Action

### Parameters
### Examples

---

## `peek` Action

### Parameters
### Examples

---

## `exec` Action

### Parameters
### Examples

---

## `find` Action

### Parameters
### Examples

---

## `delta` Action

### Parameters
### Examples

---

## `emit` Action

### Parameters
### Examples

---

## `beam` Action

### Parameters
### Examples

---

## `ps` Action

### Parameters
### Examples

---

## `df` Action

### Parameters
### Examples

---

## `zfs` Action (3 subactions)

### `pools`
#### Parameters
#### Examples

### `datasets`
#### Parameters
#### Examples

### `snapshots`
#### Parameters
#### Examples

---

## `logs` Action (4 subactions)

### `syslog`
#### Parameters
#### Examples

### `journal`
#### Parameters
#### Examples

### `dmesg`
#### Parameters
#### Examples

### `auth`
#### Parameters
#### Examples

---

## Scout Common Parameters
- Parameter format table (target, targets, source/destination, host)

## Scout Discriminator Keys
- Complete list of all 16 keys

## Scout Schemas
### Discriminated Union Pattern
### Validation
### Target Format Validation
### Nested Discriminators (zfs, logs)
### Example Schemas

---

## Appendix: Implementation Notes
- Help handler behavior
- Schema composition patterns
- Common parameter inheritance
```

## Key Changes from V2

1. **Per-subaction organization**: Each subaction gets its own ### section with Parameters and Examples nested under it
2. **Renamed `unpause` → `resume`** for better semantics
3. **Quick Reference moved to top** (right after Overview)
4. **Scout follows same pattern** as Flux with individual action sections
5. **Help Action first** in each tool section
6. **Common Parameters** and **Schemas** at end of each tool
7. **Discriminator Keys** section for reference

## Total Structure

- **Flux**: 1 Help + 4 actions (container=14, compose=9, docker=9, host=7) = 39 operations
- **Scout**: 1 Help + 11 actions (9 simple + zfs=3 + logs=4) = 16 operations
- **Grand Total**: 2 tools, 15 actions, 55 operations, 2 help handlers
