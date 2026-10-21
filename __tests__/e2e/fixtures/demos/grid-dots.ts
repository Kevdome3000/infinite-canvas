import { CheckboardStyle, type API } from '@infinite-canvas-tutorial/ecs';

export async function render(api: API) {
  await api.edit(() => api.setAppState({ checkboardStyle: CheckboardStyle.DOTS }));
}
