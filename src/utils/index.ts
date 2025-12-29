// Explicit named exports for better IDE support and tree-shaking
export {
  validateSecurePath,
  HostSecurityError,
  validateHostFormat,
  escapeShellArg,
  isSystemPath,
} from "./path-security.js";
