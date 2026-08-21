import v8 from 'v8';

const snapshot = (v8 as unknown as { startupSnapshot?: Record<string, unknown> }).startupSnapshot;
if (snapshot) {
  snapshot.isBuildingSnapshot = () => false;
}
