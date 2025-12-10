import { component, system } from '@lastolivegames/becsy';
import { Plugin } from './types';
import { ColumnLayout } from '../components';
import { ColumnLayoutSystem } from '../systems/ColumnLayoutSystem';
import { Update } from '../systems';

export const LayoutPlugin: Plugin = () => {
    component(ColumnLayout);
    system(Update)(ColumnLayoutSystem);
};
