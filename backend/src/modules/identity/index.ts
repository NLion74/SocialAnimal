export { default } from "./routes";

export {
	authenticateToken,
	requireAdmin,
	hashPassword,
	verifyPassword,
	generateToken,
} from "./auth";

export { requireStaff, protectLastAdmin, roles } from "./roles";

export type { AccountRole } from "./roles";

export {
	requestPasswordReset,
	passwordChanged,
	runRecoveryTick,
} from "./recovery";

export { securityState, resetFactor } from "./two-factor";

export { requireRecentAuthentication, verifyToken } from "./auth";

export { deleteAccount } from "./accounts";
