/** Solo se importa lo que usan los gráficos (dona y barras) para no cargar todo ECharts. */
import { BarChart, PieChart } from 'echarts/charts';
import { AriaComponent, GridComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([PieChart, BarChart, GridComponent, TooltipComponent, AriaComponent, CanvasRenderer]);

export { echarts };
export * from 'echarts/core';
