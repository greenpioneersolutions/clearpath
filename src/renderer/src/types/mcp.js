"use strict";
/**
 * Shared types for the centralized MCP management system.
 *
 * The MCP Registry is the source of truth. On every mutation, the registry is
 * rendered to the four CLI-native config files (Copilot + Claude × global + project).
 * The CLIs load those rendered files through their standard precedence rules.
 */
Object.defineProperty(exports, "__esModule", { value: true });
