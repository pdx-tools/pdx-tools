import Icon from "@ant-design/icons";

export const ChromeSvg: React.FC<{}> = () => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="32"
      height="32"
      viewBox="0 0 64 64"
    >
      <path
        data-name="layer4"
        d="M32 48.4a16.5 16.5 0 0 1-8.9-2.6 16.336 16.336 0 0 1-6-6.8L4 16a31.955 31.955 0 0 0-4 16 30.641 30.641 0 0 0 7.8 20.9 31.255 31.255 0 0 0 19.4 10.7l9.3-16.1a13.486 13.486 0 0 1-4.5.9z"
        fill="#d7d7db"
      ></path>
      <path
        data-name="layer3"
        d="M21.9 19.1A15.745 15.745 0 0 1 32 16h27.5A32.785 32.785 0 0 0 47.9 4.2 30.982 30.982 0 0 0 32 0a31.613 31.613 0 0 0-14 3.2 31.278 31.278 0 0 0-11.3 9.2L16 28a16.381 16.381 0 0 1 5.9-8.9z"
        fill="#d7d7db"
      ></path>
      <path
        data-name="layer2"
        d="M61.6 20H43a17.181 17.181 0 0 1 5.4 12 16.8 16.8 0 0 1-2.9 9.4L32.4 64a30.613 30.613 0 0 0 22.4-9.5A31.113 31.113 0 0 0 64 32a28.611 28.611 0 0 0-2.4-12z"
        fill="#d7d7db"
      ></path>
      <circle data-name="layer1" cx="32" cy="32" r="12" fill="#d7d7db"></circle>
    </svg>
  );
};

type ChromeProps = React.ComponentProps<typeof Icon>;
export const ChromeIcon: React.FC<ChromeProps> = (props) => (
  <Icon component={ChromeSvg} {...props} />
);
