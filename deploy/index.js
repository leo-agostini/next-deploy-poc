import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { S3BucketFolder } from "@pulumi/synced-folder";

const cfg = new pulumi.Config();

const app = cfg.require("app");
const environment = cfg.require("environment");
const subdomain = `${app}.leo-agostini.dev`;

const BUCKET_NAME = `bucket-${app}-${environment}`;
const CERT_NAME = `cert-${app}-${environment}`;
const DIST_NAME = `dist-${app}-${environment}`;
const OAC_NAME = `oac-${app}-${environment}`;
const POLICY_NAME = `policy-${app}-${environment}`;
const FOLDER_NAME = `folder-${app}-${environment}`;

const use1 = new aws.Provider("use1", { region: "us-east-1" });

const siteBucket = new aws.s3.Bucket(BUCKET_NAME, {
  bucket: BUCKET_NAME,
  forceDestroy: true,
});

const issuedCert = aws.acm
  .getCertificate(
    {
      domain: subdomain,
      types: ["AMAZON_ISSUED", "IMPORTED"],
      statuses: ["ISSUED"],
      mostRecent: true,
    },
    { provider: use1 }
  )
  .then((c) => c)
  .catch(() => undefined);

const createdCert = pulumi.output(issuedCert).apply((found) => {
  if (!found) {
    return new aws.acm.Certificate(
      CERT_NAME,
      {
        domainName: subdomain,
        validationMethod: "DNS",
      },
      { provider: use1 }
    );
  }
  return undefined;
});

const certArn = pulumi
  .all([issuedCert, createdCert])
  .apply(([found, created]) => found?.arn ?? created?.arn);

const oac = new aws.cloudfront.OriginAccessControl(OAC_NAME, {
  originAccessControlOriginType: "s3",
  signingBehavior: "always",
  signingProtocol: "sigv4",
});

const aliases = [subdomain];
const viewerCertificate = certArn.apply((arn) =>
  arn
    ? {
        acmCertificateArn: arn,
        sslSupportMethod: "sni-only",
        minimumProtocolVersion: "TLSv1.2_2021",
      }
    : { cloudfrontDefaultCertificate: true }
);

const dist = new aws.cloudfront.Distribution(DIST_NAME, {
  enabled: true,
  origins: [
    {
      originId: siteBucket.arn,
      domainName: siteBucket.bucketRegionalDomainName,
      originAccessControlId: oac.id,
    },
  ],
  defaultRootObject: "index.html",
  restrictions: { geoRestriction: { restrictionType: "none" } },
  defaultCacheBehavior: {
    targetOriginId: siteBucket.arn,
    viewerProtocolPolicy: "redirect-to-https",
    allowedMethods: ["GET", "HEAD"],
    cachedMethods: ["GET", "HEAD"],
    compress: true,
    forwardedValues: { cookies: { forward: "none" }, queryString: false },
  },
  priceClass: "PriceClass_100",
  customErrorResponses: [
    { errorCode: 404, responseCode: 404, responsePagePath: "/404.html" },
  ],
  aliases,
  viewerCertificate,
});

new aws.s3.BucketPolicy(POLICY_NAME, {
  bucket: siteBucket.id,
  policy: pulumi.all([siteBucket.arn, dist.arn]).apply(([bucketArn, distArn]) =>
    JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "AllowCloudFrontServicePrincipalReadOnly",
          Effect: "Allow",
          Principal: { Service: "cloudfront.amazonaws.com" },
          Action: ["s3:GetObject"],
          Resource: [`${bucketArn}/*`],
          Condition: { StringEquals: { "AWS:SourceArn": distArn } },
        },
      ],
    })
  ),
});

new S3BucketFolder(
  FOLDER_NAME,
  {
    path: "out",
    bucketName: siteBucket.bucket,
    acl: "private",
  },
  { dependsOn: [dist] }
);

// CNAMEs de validação só se criou novo cert
export const acmDnsValidationRecords = pulumi.output(createdCert).apply((c) =>
  c
    ? c.domainValidationOptions.apply((ops) =>
        (ops ?? []).map((o) => ({
          domain: o.domainName,
          name: o.resourceRecordName,
          type: o.resourceRecordType,
          value: o.resourceRecordValue,
        }))
      )
    : undefined
);

export const acmCertificateArn = certArn;
export const cloudfrontTarget = dist.domainName;
export const suggestedDnsInstructions = pulumi.interpolate`
Ask your DNS provider to create:
1) (If present) CNAME(s) for ACM validation from acmDnsValidationRecords.
2) CNAME record: ${subdomain} -> ${dist.domainName}
`;
