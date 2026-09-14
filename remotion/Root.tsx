import {Composition} from 'remotion';
import {ClosingOrder} from './ClosingOrder';
import {SupplierNegotiation} from './SupplierNegotiation';

export const RemotionRoot = () => (
  <>
    <Composition
      id="SupplierNegotiation"
      component={SupplierNegotiation}
      durationInFrames={1200}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="ClosingOrder"
      component={ClosingOrder}
      durationInFrames={450}
      fps={30}
      width={1920}
      height={1080}
    />
  </>
);
