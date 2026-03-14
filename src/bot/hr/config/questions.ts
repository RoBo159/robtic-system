export type Question = {
  id: string;
  question: string;
  answer?: string;
};

export const questions: Question[] = [
  { id: "q1", question: "Dev stack?" },
  { id: "q2", question: "Years of experience?" },
  { id: "q3", question: "Weekly active hours?" },
];
