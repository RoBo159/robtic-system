export type DepartmentEmbedConfig = {
  openTitle: string;
  openDescription: string;
  openColor: number;
  submissionTitle: string;
  submissionColor: number;
};

export const departmentEmbeds: Record<Department, DepartmentEmbedConfig> = {
  Dev: {
    openTitle: "Dev Department Applications",
    openDescription: "If you are interested in joining the Dev team, click submit and answer carefully.",
    openColor: 0x5865f2,
    submissionTitle: "New Dev Department Submission",
    submissionColor: 0x5865f2,
  },
  Design: {
    openTitle: "Design Department Applications",
    openDescription: "If you are interested in joining the Design team, click submit and answer carefully.",
    openColor: 0xeb459e,
    submissionTitle: "New Design Department Submission",
    submissionColor: 0xeb459e,
  },
  Moderation: {
    openTitle: "Moderation Department Applications",
    openDescription: "If you are interested in joining the Moderation team, click submit and answer carefully.",
    openColor: 0xed4245,
    submissionTitle: "New Moderation Department Submission",
    submissionColor: 0xed4245,
  },
  Community: {
    openTitle: "Community Department Applications",
    openDescription: "If you are interested in joining the Community team, click submit and answer carefully.",
    openColor: 0x57f287,
    submissionTitle: "New Community Department Submission",
    submissionColor: 0x57f287,
  },
  Events: {
    openTitle: "Events Department Applications",
    openDescription: "If you are interested in joining the Events team, click submit and answer carefully.",
    openColor: 0xfee75c,
    submissionTitle: "New Events Department Submission",
    submissionColor: 0xfee75c,
  },
  Support: {
    openTitle: "Support Department Applications",
    openDescription: "If you are interested in joining the Support team, click submit and answer carefully.",
    openColor: 0x3498db,
    submissionTitle: "New Support Department Submission",
    submissionColor: 0x3498db,
  },
  HR: {
    openTitle: "HR Department Applications",
    openDescription: "If you are interested in joining the HR team, click submit and answer carefully.",
    openColor: 0x2ecc71,
    submissionTitle: "New HR Department Submission",
    submissionColor: 0x2ecc71,
  },
};

export function getDepartmentEmbedConfig(department: Department): DepartmentEmbedConfig {
  return departmentEmbeds[department];
}
